const { PNL } = require('./categorization');
const MATERIAL_ABSOLUTE = 500,
  MATERIAL_PERCENT = 10;
const monthKey = (date) => new Date(date).toISOString().slice(0, 7);
const centsTotal = (rows, cats) =>
  rows
    .filter((t) => cats.has(t.category))
    .reduce((sum, t) => sum + Math.round(Math.abs(t.amount) * 100), 0);
const dollars = (cents) => cents / 100;
function categoryTotals(rows) {
  const cents = new Map();
  for (const t of rows.filter((t) => t.isPnl !== false))
    cents.set(t.category, (cents.get(t.category) || 0) + Math.round(Math.abs(t.amount) * 100));
  for (const [category, group] of Object.entries(PNL))
    if (group === 'contraRevenue') cents.set(category, -(cents.get(category) || 0));
  return Object.fromEntries([...cents].map(([category, value]) => [category, dollars(value)]));
}
function calculateMonth(transactions, month) {
  const rows = transactions.filter((t) => monthKey(t.date) === month);
  const groups = {};
  for (const [category, group] of Object.entries(PNL)) (groups[group] ||= new Set()).add(category);
  const sales = dollars(centsTotal(rows, groups.revenue || new Set()));
  const contraRevenue = dollars(centsTotal(rows, groups.contraRevenue || new Set()));
  const revenue = dollars(Math.round((sales - contraRevenue) * 100)),
    cogs = dollars(centsTotal(rows, groups.cogs || new Set())),
    payroll = dollars(centsTotal(rows, groups.payroll || new Set())),
    operatingExpenses = dollars(centsTotal(rows, groups.opex || new Set()));
  const grossProfit = dollars(Math.round((revenue - cogs) * 100)),
    operatingProfit = dollars(Math.round((grossProfit - payroll - operatingExpenses) * 100)),
    pnlCategories = new Set(Object.keys(PNL));
  return {
    month,
    transactionCount: rows.length,
    revenue,
    sales,
    contraRevenue,
    cogs,
    grossProfit,
    payroll,
    operatingExpenses,
    operatingProfit,
    grossMargin: revenue ? (grossProfit / revenue) * 100 : null,
    operatingMargin: revenue ? (operatingProfit / revenue) * 100 : null,
    evidenceIds: rows
      .filter((t) => pnlCategories.has(t.category))
      .map((t) => String(t._id || t.id || t.externalId)),
    categoryTotals: categoryTotals(rows),
  };
}
function calculatePnl(transactions) {
  return [...new Set(transactions.map((t) => monthKey(t.date)))]
    .sort()
    .map((month) => calculateMonth(transactions, month));
}
function calculateVariances(pnl) {
  return pnl.slice(1).map((current, i) => {
    const previous = pnl[i];
    const metrics = [
      'revenue',
      'cogs',
      'grossProfit',
      'payroll',
      'operatingExpenses',
      'operatingProfit',
    ].map((metric) => {
      const before = previous[metric],
        after = current[metric],
        change = dollars(Math.round((after - before) * 100)),
        percent = before === 0 ? (after === 0 ? 0 : null) : (change / Math.abs(before)) * 100;
      return {
        metric,
        previous: before,
        current: after,
        change,
        percent,
        material:
          Math.abs(change) >= MATERIAL_ABSOLUTE &&
          (percent === null || Math.abs(percent) >= MATERIAL_PERCENT),
      };
    });
    const drivers = [
      ...new Set([...Object.keys(previous.categoryTotals), ...Object.keys(current.categoryTotals)]),
    ]
      .map((category) => {
        const before = previous.categoryTotals[category] || 0,
          after = current.categoryTotals[category] || 0,
          change = dollars(Math.round((after - before) * 100));
        return {
          category,
          previous: before,
          current: after,
          change,
          profitImpact: ['revenue', 'contraRevenue'].includes(PNL[category]) ? change : -change,
        };
      })
      .filter((x) => x.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    return {
      from: previous.month,
      to: current.month,
      metrics,
      materialVariances: metrics.filter((m) => m.material),
      drivers,
    };
  });
}
const reviewItems = (rows) => rows.filter((t) => t.needsReview && !t.reviewed);
module.exports = {
  MATERIAL_ABSOLUTE,
  MATERIAL_PERCENT,
  monthKey,
  calculateMonth,
  calculatePnl,
  calculateVariances,
  categoryTotals,
  reviewItems,
};
