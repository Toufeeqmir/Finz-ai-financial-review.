const express = require('express'),
  multer = require('multer'),
  crypto = require('crypto'),
  mongoose = require('mongoose');
const Transaction = require('../models/Transaction'),
  ImportBatch = require('../models/ImportBatch');
const { CATEGORIES, PNL } = require('../services/categorization');
const { parseUploadedFile } = require('../services/importer');
const { calculatePnl, calculateVariances, reviewItems } = require('../services/financial');
const { makeCorrection } = require('../services/corrections');
const { runAnalyst } = require('../services/analyst');
const { classifyUnknown, configured } = require('../services/ai');
const r = express.Router(),
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, done) =>
      /\.(csv|xlsx|xls)$/i.test(file.originalname)
        ? done(null, true)
        : done(Object.assign(new Error('Upload a CSV, XLSX, or XLS file.'), { status: 415 })),
  });
const excludeDuplicateFingerprints = (rows, seen = new Set()) =>
  rows.filter((t) => {
    if (seen.has(t.fingerprint)) return false;
    seen.add(t.fingerprint);
    return true;
  });
r.get('/health', (req, res) =>
  res.json({
    ok: true,
    service: 'finz-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
);
r.get('/categories', (req, res) => res.json({ categories: CATEGORIES, pnlCategories: PNL }));
r.get('/overview', async (req, res, next) => {
  try {
    const [transactions, batches] = await Promise.all([
      Transaction.find({}).sort({ date: 1 }).lean(),
      ImportBatch.find({ status: 'imported' }).sort({ createdAt: -1 }).limit(1).lean(),
    ]);
    const pnl = calculatePnl(transactions),
      variances = calculateVariances(pnl),
      categoryCounts = {};
    for (const t of transactions)
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    res.json({
      transactions,
      pnl,
      variances,
      reviewCount: reviewItems(transactions).length,
      categoryCounts,
      latestBatch: batches[0] || null,
      configuredAI: configured(),
    });
  } catch (e) {
    next(e);
  }
});
r.get('/transactions', async (req, res, next) => {
  try {
    const {
        q = '',
        month,
        category,
        review = 'all',
        confidence = 'all',
        sort = 'date',
        order = 'desc',
        page = 1,
        limit = 50,
      } = req.query,
      f = {};
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      f.date = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
    }
    if (category && category !== 'all') f.category = category;
    if (review === 'unresolved') Object.assign(f, { needsReview: true, reviewed: false });
    else if (review === 'reviewed') f.reviewed = true;
    else if (review === 'flagged') f.needsReview = true;
    if (confidence === 'low') f.confidence = { $lt: 0.78 };
    if (confidence === 'medium') f.confidence = { $gte: 0.78, $lt: 0.9 };
    if (confidence === 'high') f.confidence = { $gte: 0.9 };
    if (q.trim()) {
      const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      f.$or = ['externalId', 'description', 'counterparty', 'category'].map((k) => ({
        [k]: { $regex: safe, $options: 'i' },
      }));
    }
    const allowed = ['date', 'amount', 'externalId', 'category', 'confidence'],
      field = allowed.includes(sort) ? sort : 'date',
      p = Math.max(1, Number(page) || 1),
      n = Math.min(200, Math.max(1, Number(limit) || 50));
    const [rows, total] = await Promise.all([
      Transaction.find(f)
        .sort({ [field]: order === 'asc' ? 1 : -1, externalId: 1 })
        .skip((p - 1) * n)
        .limit(n)
        .lean(),
      Transaction.countDocuments(f),
    ]);
    res.json({ rows, total, page: p, limit: n, pages: Math.ceil(total / n) });
  } catch (e) {
    next(e);
  }
});
r.get('/transactions/:id', async (req, res, next) => {
  try {
    const t = await Transaction.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ error: 'Transaction not found.' });
    res.json(t);
  } catch (e) {
    next(e);
  }
});
r.patch('/transactions/:id', async (req, res, next) => {
  try {
    const t = await Transaction.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction not found.' });
    if (typeof req.body.reviewed === 'boolean' && !req.body.category) {
      t.reviewed = req.body.reviewed;
      if (req.body.reviewed) t.needsReview = false;
      else if (t.confidence < 0.78 || t.category === 'Needs Review') t.needsReview = true;
      await t.save();
      return res.json(t);
    }
    const c = makeCorrection(t.toObject(), req.body.category, {
      reason: String(req.body.reason || '').slice(0, 400),
    });
    t.category = c.category;
    t.originalCategory = c.originalCategory;
    t.isPnl = c.isPnl;
    t.confidence = c.confidence;
    t.classificationMethod = c.classificationMethod;
    t.classificationReason = c.classificationReason;
    t.needsReview = c.needsReview;
    t.reviewed = c.reviewed;
    t.corrections.push(c.correction);
    await t.save();
    res.json(t);
  } catch (e) {
    next(e);
  }
});
r.post('/imports/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to import.' });
    const p = parseUploadedFile(req.file.buffer, req.file.originalname),
      fingerprints = p.rows.map((t) => t.fingerprint),
      existing = await Transaction.find(
        { fingerprint: { $in: fingerprints } },
        { fingerprint: 1 }
      ).lean(),
      dups = new Set(existing.map((t) => t.fingerprint)),
      unique = excludeDuplicateFingerprints(p.rows, dups),
      batch = await ImportBatch.create({
        sourceFile: req.file.originalname,
        contentHash: crypto.createHash('sha256').update(req.file.buffer).digest('hex'),
        totalRows: p.totalRows,
        invalidRows: p.invalidRows,
        duplicateRows: p.rows.length - unique.length,
        validationErrors: p.errors,
        previewRows: p.rows,
        status: 'previewed',
      });
    res.json({
      batchId: String(batch._id),
      sourceFile: batch.sourceFile,
      totalRows: p.totalRows,
      validRows: p.rows.length,
      duplicateRows: batch.duplicateRows,
      invalidRows: p.invalidRows,
      classifiedRows: p.rows.filter((t) => t.category !== 'Needs Review').length,
      reviewRows: p.rows.filter((t) => t.needsReview).length,
      errors: p.errors,
      preview: p.rows.slice(0, 12),
    });
  } catch (e) {
    next(e);
  }
});
r.post('/imports/:id/confirm', async (req, res, next) => {
  try {
    const batch = await ImportBatch.findById(req.params.id);
    if (!batch)
      return res.status(404).json({ error: 'Import preview not found. Upload the file again.' });
    if (batch.status === 'imported')
      return res.status(409).json({ error: 'This batch has already been imported.' });
    const existing = await Transaction.find(
        { fingerprint: { $in: batch.previewRows.map((t) => t.fingerprint) } },
        { fingerprint: 1 }
      ).lean(),
      dups = new Set(existing.map((t) => t.fingerprint)),
      unique = excludeDuplicateFingerprints(batch.previewRows, dups),
      rows = unique.map((t) => ({
        ...t,
        date: new Date(t.date),
        sourceFile: batch.sourceFile,
        importBatchId: batch._id,
      }));
    if (req.body.allowExternalAI === true && configured()) {
      for (const t of rows.filter((x) => x.category === 'Needs Review'))
        try {
          Object.assign(t, (await classifyUnknown(t)) || {});
        } catch {
          /* retain deterministic review classification */
        }
    }
    const saved = rows.length ? await Transaction.insertMany(rows, { ordered: false }) : [];
    batch.importedRows = saved.length;
    batch.duplicateRows = batch.totalRows - batch.invalidRows - saved.length;
    batch.reviewRows = saved.filter((t) => t.needsReview).length;
    batch.status = 'imported';
    batch.previewRows = [];
    await batch.save();
    res.json({
      batchId: String(batch._id),
      sourceFile: batch.sourceFile,
      totalRows: batch.totalRows,
      importedRows: saved.length,
      duplicateRows: batch.duplicateRows,
      invalidRows: batch.invalidRows,
      categorizedRows: saved.filter((t) => t.category !== 'Needs Review').length,
      reviewRows: batch.reviewRows,
    });
  } catch (e) {
    next(e);
  }
});
r.get('/imports', async (req, res, next) => {
  try {
    res.json({
      batches: await ImportBatch.find({ status: 'imported' })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    });
  } catch (e) {
    next(e);
  }
});
r.get('/financial/pnl', async (req, res, next) => {
  try {
    const pnl = calculatePnl(await Transaction.find({}).lean());
    res.json({
      pnl,
      selected: req.query.month ? pnl.find((x) => x.month === req.query.month) || null : null,
    });
  } catch (e) {
    next(e);
  }
});
r.get('/financial/variances', async (req, res, next) => {
  try {
    res.json({
      methodology: { absoluteThreshold: 500, percentThreshold: 10 },
      variances: calculateVariances(calculatePnl(await Transaction.find({}).lean())),
    });
  } catch (e) {
    next(e);
  }
});
r.get('/reviews', async (req, res, next) => {
  try {
    const rows = await Transaction.find({ needsReview: true, reviewed: false })
      .sort({ confidence: 1, date: 1 })
      .lean();
    res.json({ rows, total: rows.length });
  } catch (e) {
    next(e);
  }
});
r.post('/analyst', async (req, res, next) => {
  try {
    if (
      typeof req.body.question !== 'string' ||
      !req.body.question.trim() ||
      req.body.question.length > 500
    )
      return res.status(400).json({ error: 'Enter a question up to 500 characters.' });
    res.json(
      await runAnalyst({
        question: req.body.question.trim(),
        useExternalAI: req.body.useExternalAI === true,
      })
    );
  } catch (e) {
    next(e);
  }
});
module.exports = r;
