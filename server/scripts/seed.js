require('dotenv').config();
const mongoose = require('mongoose'),
  { seed } = require('../server');
(async () => {
  await mongoose.connect(process.env.FINZ_MONGODB_URI || 'mongodb://127.0.0.1:27017/finz_review');
  await seed();
  await mongoose.disconnect();
})().catch((e) => {
  console.error(`Seed failed: ${e.message}`);
  process.exit(1);
});
