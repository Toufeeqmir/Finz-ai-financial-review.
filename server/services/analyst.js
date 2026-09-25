const Transaction = require('../models/Transaction');
const { PNL } = require('./categorization');
const { calculatePnl, calculateVariances, monthKey, reviewItems } = require('./financial');
const { explainVerifiedFacts } = require('./ai');
function requestedMonth(q, pnl) {
  const months = [
    ...q.matchAll(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g
    ),
  ];
  if (!months.length) return pnl.at(-1)?.month;
  const name = months.at(-1)[1],
    y = q.match(/\b20\d{2}\b/)?.[0] || '2026';
  return `${y}-${String(new Date(`${name} 1, ${y}`).getMonth() + 1).padStart(2, '0')}`;
}
async function runAnalyst({ question, useExternalAI = false }) {
  const tx = await Transaction.find({}).sort({ date: 1, externalId: 1 }).lean(),
    pnl = calculatePnl(tx),
    variances = calculateVariances(pnl),
    q = question.toLowerCase(),
    key = requestedMonth(q, pnl),
    p = pnl.find((x) => x.month === key) || pnl.at(-1);
  if (!p)
    return {
      operation: 'no_data',
      title: 'No transactions to analyze',
      answer: 'Import a transaction file before asking about financial results.',
      evidence: [],
      evidenceCount: 0,
    };
  let operation = 'monthly_pnl',
    title,
    answer,
    evidence = [],
    data = {};
  const rowsIn = (months, categories = null) =>
    tx
      .filter(
        (t) => months.includes(monthKey(t.date)) && (!categories || categories.has(t.category))
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (/attention|review|unusual/.test(q)) {
    operation = 'review_items';
    title = 'Transactions needing your attention';
    evidence = reviewItems(tx);
    data = { count: evidence.length, transactionIds: evidence.map((t) => String(t._id)) };
    answer = evidence.length
      ? `${evidence.length} transaction${evidence.length === 1 ? '' : 's'} are flagged for review. These entries require confirmation of their accounting treatment.`
      : 'There are no unresolved review items in the imported ledger.';
  } else if (
    /most significant|changed most|what changed|biggest change|largest change|behind (the )?(variance|change)|transactions behind/.test(
      q
    )
  ) {
    operation = 'most_material_variance';
    title = 'Most significant period changes';
    const v = variances.find((x) => x.to === p.month) || variances.at(-1);
    if (!v) {
      answer = 'There is no adjacent month in the imported data to compare yet.';
      evidence = rowsIn([p.month]);
      data = { month: p.month, transactionIds: evidence.map((t) => String(t._id)) };
    } else {
      const changes = (v.materialVariances?.length ? v.materialVariances : v.metrics)
          .filter((x) => x.metric !== 'grossMargin')
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
        largest = changes[0],
        drivers = [...(v.drivers || [])].sort(
          (a, b) => Math.abs(b.profitImpact) - Math.abs(a.profitImpact)
        ),
        showingBehind = /behind (the )?(variance|change)|transactions behind/.test(q),
        sourceDrivers = showingBehind ? drivers.slice(0, 3) : drivers.slice(0, 1),
        driverCats = new Set(sourceDrivers.map((d) => d.category)),
        metricLabel =
          {
            revenue: 'revenue',
            cogs: 'cost of goods sold',
            grossProfit: 'gross profit',
            payroll: 'payroll',
            operatingExpenses: 'operating expenses',
            operatingProfit: 'operating profit',
          }[largest?.metric] || largest?.metric;
      evidence = rowsIn([v.from, v.to], driverCats);
      data = {
        from: v.from,
        to: v.to,
        largestVariance: largest || null,
        leadingDrivers: sourceDrivers,
        materialVariances: v.materialVariances,
        drivers: v.drivers,
        transactionIds: evidence.map((t) => String(t._id)),
      };
      answer = largest
        ? `The largest ${largest.material ? 'material ' : ''}dollar change was ${metricLabel}: ${largest.change >= 0 ? 'increased' : 'decreased'} by $${Math.abs(largest.change).toFixed(2)} from ${v.from} to ${v.to}. ${sourceDrivers.length ? `Largest account movement: ${sourceDrivers.map((d) => `${d.category} ${d.change >= 0 ? 'up' : 'down'} $${Math.abs(d.change).toFixed(2)}`).join('; ')}.` : ''} ${evidence.length} related source transactions are attached.`
        : `No material changes met the defined threshold between ${v.from} and ${v.to}.`;
    }
  } else if (/payroll|wages|salary/.test(q)) {
    operation = 'monthly_payroll';
    title = 'Payroll by month';
    const periods = /each month|every month|monthly|all months/.test(q) ? pnl : [p],
      cats = new Set(
        Object.entries(PNL)
          .filter(([, g]) => g === 'payroll')
          .map(([c]) => c)
      );
    evidence = rowsIn(
      periods.map((x) => x.month),
      cats
    );
    data = {
      months: periods.map((x) => ({ month: x.month, payroll: x.payroll })),
      transactionIds: evidence.map((t) => String(t._id)),
    };
    answer = periods.map((x) => `${x.month}: $${x.payroll.toFixed(2)}`).join(' · ');
  } else if (
    /food|cogs|cost of goods|inventory/.test(q) &&
    /increase|change|drive|why|between|versus|vs/.test(q)
  ) {
    operation = 'cogs_variance';
    title = 'Food and beverage cost movement';
    const v = variances.find((x) => x.to === p.month);
    if (!v) {
      answer = `Cost of goods sold in ${p.month} was $${p.cogs.toFixed(2)}. There is no prior period for comparison.`;
      evidence = rowsIn(
        [p.month],
        new Set(
          Object.entries(PNL)
            .filter(([, g]) => g === 'cogs')
            .map(([c]) => c)
        )
      );
      data = { current: p.cogs, transactionIds: evidence.map((t) => String(t._id)) };
    } else {
      const m = v.metrics.find((x) => x.metric === 'cogs'),
        cats = new Set(
          Object.entries(PNL)
            .filter(([, g]) => g === 'cogs')
            .map(([c]) => c)
        );
      evidence = rowsIn([v.from, v.to], cats);
      const drivers = v.drivers.filter((d) => cats.has(d.category));
      data = {
        previous: m.previous,
        current: m.current,
        change: m.change,
        drivers,
        transactionIds: evidence.map((t) => String(t._id)),
      };
      answer = `Cost of goods sold ${m.change >= 0 ? 'increased' : 'decreased'} by $${Math.abs(m.change).toFixed(2)} from ${v.from} to ${v.to}. Largest category movements: ${
        drivers
          .slice(0, 3)
          .map(
            (d) =>
              `${d.category} ${d.change >= 0 ? 'up' : 'down'} $${Math.abs(d.change).toFixed(2)}`
          )
          .join(', ') || 'not separately identifiable'
      }.`;
    }
  } else if (/profit|variance|change/.test(q) && /why|between|february|march|driver/.test(q)) {
    operation = 'operating_profit_variance';
    title = 'Operating profit movement';
    const v = variances.find((x) => x.to === p.month);
    if (!v) {
      answer = `Operating profit in ${p.month} was $${p.operatingProfit.toFixed(2)}. There is no prior month to compare.`;
      evidence = rowsIn([p.month], new Set(Object.keys(PNL)));
      data = { current: p.operatingProfit, transactionIds: evidence.map((t) => String(t._id)) };
    } else {
      const m = v.metrics.find((x) => x.metric === 'operatingProfit');
      evidence = rowsIn([v.from, v.to], new Set(Object.keys(PNL)));
      data = {
        previous: m.previous,
        current: m.current,
        change: m.change,
        percent: m.percent,
        material: m.material,
        drivers: v.drivers,
        transactionIds: evidence.map((t) => String(t._id)),
      };
      const top = [...v.drivers]
        .sort((a, b) => Math.abs(b.profitImpact) - Math.abs(a.profitImpact))
        .slice(0, 3);
      answer = `Operating profit ${m.change >= 0 ? 'increased' : 'decreased'} by $${Math.abs(m.change).toFixed(2)} from ${v.from} ($${m.previous.toFixed(2)}) to ${v.to} ($${m.current.toFixed(2)}). Largest calculated category effects on profit: ${top.map((d) => `${d.category} ${d.profitImpact >= 0 ? '+' : '−'}$${Math.abs(d.profitImpact).toFixed(2)}`).join(', ')}.`;
    }
  } else if (/revenue|sales/.test(q)) {
    operation = 'monthly_revenue';
    title = `Revenue · ${p.month}`;
    const cats = new Set(
      Object.entries(PNL)
        .filter(([, g]) => ['revenue', 'contraRevenue'].includes(g))
        .map(([c]) => c)
    );
    evidence = rowsIn([p.month], cats);
    data = {
      month: p.month,
      revenue: p.revenue,
      sales: p.sales,
      refundsAndDiscounts: p.contraRevenue,
      transactionIds: evidence.map((t) => String(t._id)),
    };
    answer = `Revenue was $${p.revenue.toFixed(2)} in ${p.month}, including $${p.sales.toFixed(2)} in receipts less $${p.contraRevenue.toFixed(2)} in refunds and discounts.`;
  } else if (/transaction|show me|evidence/.test(q)) {
    operation = 'transactions_by_period';
    title = `Transactions · ${p.month}`;
    evidence = rowsIn([p.month]).slice(0, 50);
    data = {
      month: p.month,
      count: evidence.length,
      transactionIds: evidence.map((t) => String(t._id)),
    };
    answer = `Found ${evidence.length} transactions in ${p.month}.`;
  } else {
    operation = 'unsupported';
    title = 'Choose a financial question';
    answer =
      'I can answer about revenue, payroll, food costs, profit changes, review items, or transactions in the imported periods.';
  }
  let explanation = null;
  if (useExternalAI && operation !== 'unsupported')
    try {
      explanation = await explainVerifiedFacts(question, operation, { answer, data });
    } catch {
      /* Keep the deterministic answer available if the provider fails. */
    }
  return {
    operation,
    title,
    answer,
    explanation: explanation || null,
    explanationProvider: explanation ? 'groq' : 'deterministic',
    data,
    evidence: evidence
      .slice(0, 100)
      .map((t) => ({
        id: String(t._id),
        externalId: t.externalId,
        date: t.date,
        description: t.description,
        counterparty: t.counterparty,
        amount: t.amount,
        category: t.category,
        method: t.paymentMethod,
        confidence: t.confidence,
      })),
    evidenceCount: evidence.length,
  };
}
module.exports = { runAnalyst };
