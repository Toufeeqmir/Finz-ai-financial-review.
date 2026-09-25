const request = require('supertest'),
  mongoose = require('mongoose'),
  app = require('../app');
describe('REST API contract', () => {
  test('health reports API and Mongo status without opening a connection', async () => {
    const r = await request(app).get('/api/finz/health').expect(200);
    expect(r.body).toMatchObject({ ok: true, service: 'finz-api', database: 'disconnected' });
  });
  test('returns the allowed category chart', async () => {
    const r = await request(app).get('/api/finz/categories').expect(200);
    expect(r.body.categories).toContain('Food & Ingredients');
    expect(r.body.pnlCategories['Loan Principal']).toBeUndefined();
  });
  test('validates analyst requests before querying MongoDB', async () => {
    const r = await request(app).post('/api/finz/analyst').send({ question: '' }).expect(400);
    expect(r.body.error).toMatch(/question/);
  });
});
afterAll(async () => {
  await mongoose.disconnect();
});
