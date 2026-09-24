const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  sourceFile: { type: String, required: true }, contentHash: { type: String, required: true }, totalRows: Number,
  importedRows: { type: Number, default: 0 }, duplicateRows: { type: Number, default: 0 }, invalidRows: { type: Number, default: 0 }, reviewRows: { type: Number, default: 0 },
  status: { type: String, enum: ['previewed', 'imported', 'failed'], default: 'previewed' }, validationErrors: { type: [mongoose.Schema.Types.Mixed], default: [] },
  previewRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, collection: 'finz_import_batches' });
module.exports = mongoose.models.FinzImportBatch || mongoose.model('FinzImportBatch', schema);
