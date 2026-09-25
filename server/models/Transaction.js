const mongoose = require('mongoose');
const correction = new mongoose.Schema(
  {
    fromCategory: String,
    toCategory: String,
    reason: String,
    correctedBy: String,
    correctedAt: Date,
  },
  { _id: false }
);
const schema = new mongoose.Schema(
  {
    externalId: { type: String, required: true, trim: true },
    fingerprint: { type: String, required: true, unique: true },
    date: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true },
    counterparty: { type: String, default: '' },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, default: '' },
    sourceFile: { type: String, default: '' },
    importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportBatch' },
    category: { type: String, required: true, index: true },
    isPnl: { type: Boolean, default: false },
    confidence: { type: Number, min: 0, max: 1, required: true },
    classificationMethod: {
      type: String,
      enum: ['rules', 'counterparty', 'ai', 'manual', 'review'],
      default: 'rules',
    },
    classificationReason: { type: String, default: '' },
    originalCategory: { type: String, default: '' },
    needsReview: { type: Boolean, default: false, index: true },
    reviewed: { type: Boolean, default: false },
    corrections: { type: [correction], default: [] },
  },
  { timestamps: true, collection: 'finz_transactions' }
);
schema.index({ date: 1, category: 1 });
schema.index({ externalId: 1, date: 1 });
module.exports = mongoose.models.FinzTransaction || mongoose.model('FinzTransaction', schema);
