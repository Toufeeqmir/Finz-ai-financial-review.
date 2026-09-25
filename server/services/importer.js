const crypto = require('crypto');
const XLSX = require('xlsx');
const { classify } = require('./categorization');
function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
const norm = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 100000)
    return new Date(Math.round((Number(s) - 25569) * 86400000));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value ?? '').trim(),
    negative = /^\(.*\)$/.test(s) || /\bDR$/i.test(s),
    n = Number(
      s
        .replace(/[,$\s()]/g, '')
        .replace(/^(CR|DR)/i, '')
        .replace(/(CR|DR)$/i, '')
    );
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}
const fingerprint = (t) =>
  crypto
    .createHash('sha256')
    .update(
      [
        t.externalId,
        t.date.toISOString().slice(0, 10),
        t.description.toLowerCase(),
        t.counterparty.toLowerCase(),
        t.amount.toFixed(2),
      ].join('|')
    )
    .digest('hex');
function normalizeRows(raw) {
  if (!raw.length)
    return {
      rows: [],
      errors: [{ row: 1, message: 'The file has no header or data rows.' }],
      totalRows: 0,
      invalidRows: 0,
    };
  const hs = raw[0].map(norm),
    loc = (aliases) => hs.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
  const ix = {
    id: loc(['transaction id', 'transaction number', 'reference', 'id']),
    date: loc(['date', 'transaction date', 'posted date']),
    desc: loc(['description', 'memo', 'narrative', 'details']),
    party: loc(['counterparty', 'vendor', 'payee', 'merchant', 'name']),
    amount: loc(['amount', 'transaction amount', 'value']),
    method: loc(['method', 'payment method', 'type', 'account']),
  };
  const missing = ['date', 'desc', 'amount'].filter((k) => ix[k] < 0);
  if (missing.length) {
    const totalRows = Math.max(0, raw.length - 1);
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Required columns not found: ${missing.join(', ')}. Expected date, description and amount.`,
        },
      ],
      totalRows,
      invalidRows: totalRows,
    };
  }
  const rows = [],
    errors = [];
  raw.slice(1).forEach((r, i) => {
    const rowNo = i + 2,
      date = parseDate(r[ix.date]),
      amount = parseAmount(r[ix.amount]),
      description = String(r[ix.desc] ?? '').trim(),
      bad = [];
    if (!date) bad.push('valid date');
    if (amount === null) bad.push('numeric amount');
    if (!description) bad.push('description');
    if (bad.length) {
      errors.push({ row: rowNo, message: `Missing or invalid ${bad.join(', ')}.` });
      return;
    }
    const t = {
      externalId: String(ix.id >= 0 && r[ix.id] ? r[ix.id] : `ROW-${rowNo}`),
      date,
      description,
      counterparty: String(ix.party >= 0 ? (r[ix.party] ?? '') : '').trim(),
      amount,
      paymentMethod: String(ix.method >= 0 ? (r[ix.method] ?? '') : '').trim(),
    };
    Object.assign(t, classify(t));
    t.originalCategory = t.category;
    t.fingerprint = fingerprint(t);
    rows.push(t);
  });
  return { rows, errors, totalRows: raw.length - 1, invalidRows: errors.length };
}
function parseUploadedFile(buffer, name) {
  const ext = String(name).split('.').pop().toLowerCase();
  let raw;
  if (ext === 'csv') raw = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  else if (['xlsx', 'xls'].includes(ext)) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: true,
      defval: '',
    });
  } else throw Object.assign(new Error('Upload CSV, XLSX, or XLS.'), { status: 415 });
  return normalizeRows(raw);
}
module.exports = {
  parseCsv,
  parseDate,
  parseAmount,
  fingerprint,
  normalizeRows,
  parseUploadedFile,
};
