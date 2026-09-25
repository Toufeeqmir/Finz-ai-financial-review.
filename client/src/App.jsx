import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  askAnalyst,
  confirmImport,
  correctTransaction,
  getOverview,
  previewImport,
  setReviewed,
} from './services/finzApi';

const CATEGORIES = [
  'Food Sales',
  'Beverage Sales',
  'Catering Revenue',
  'Delivery Revenue',
  'Other Revenue',
  'Sales Returns & Discounts',
  'Food & Ingredients',
  'Beverage Inventory',
  'Packaging & Disposables',
  'Payroll Wages',
  'Payroll Taxes & Benefits',
  'Rent',
  'Utilities',
  'Insurance',
  'Marketing',
  'Software & Subscriptions',
  'Repairs & Maintenance',
  'Delivery & Payment Fees',
  'Professional Services',
  'Office & Admin',
  'Cleaning & Linen',
  'Other Operating Expense',
  'Gift Card Liability',
  'Sales Tax Payable',
  'Equipment / Capital Purchase',
  'Loan Principal',
  'Owner Distribution',
  'Needs Review',
];
const money = (n = 0, compact = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(Number(n) || 0);
const percent = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');
const labelMonth = (key, short = false) =>
  key
    ? new Date(`${key}-02T12:00:00`).toLocaleDateString('en-US', {
        month: short ? 'short' : 'long',
        year: 'numeric',
      })
    : '—';
const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const idOf = (t) => t?._id || t?.id;
const DOLLAR_LINES = [
  'revenue',
  'cogs',
  'grossProfit',
  'payroll',
  'operatingExpenses',
  'operatingProfit',
];

function Icon({ name, size = 18 }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 14 4-4 4 3 6-7" />
      </>
    ),
    receipt: (
      <>
        <path d="M4 3h16v18l-4-2-4 2-4-2-4 2z" />
        <path d="M8 8h8M8 12h8M8 16h4" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2L12 3z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5" />
        <path d="M4 16v4h16v-4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
      </>
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    searchFile: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M8 10.5h5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState('Overview');
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterReview, setFilterReview] = useState('all');
  const [filterConfidence, setFilterConfidence] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: -1 });
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [allowExternalAI, setAllowExternalAI] = useState(false);
  const [importing, setImporting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [ask, setAsk] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [useExternalAI, setUseExternalAI] = useState(false);
  const [lastEvidence, setLastEvidence] = useState([]);
  const [inspectedVariance, setInspectedVariance] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await getOverview();
      setData(result);
      if (!month && result.pnl?.length) setMonth(result.pnl.at(-1).month);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [month]);
  useEffect(() => {
    refresh();
  }, []); // Load the server's current workspace once on entry.
  const txns = data?.transactions || [];
  const pnl = data?.pnl || [];
  const months = pnl.map((x) => x.month);
  const selectedPnl = pnl.find((x) => x.month === month) || pnl.at(-1);
  const variance = data?.variances?.find((x) => x.to === selectedPnl?.month);
  const previous = pnl.find((x) => x.month === variance?.from);
  const reviewRows = txns.filter((t) => t.needsReview && !t.reviewed);
  const selectedVariance = inspectedVariance || variance;
  const recentRows = [...txns].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  const filteredRows = useMemo(() => {
    let rows = txns.filter(
      (t) => !month || active === 'Needs Review' || String(t.date).slice(0, 7) === month
    );
    if (active === 'Needs Review' || filterReview === 'unresolved')
      rows = rows.filter((t) => t.needsReview && !t.reviewed);
    else if (filterReview === 'reviewed') rows = rows.filter((t) => t.reviewed);
    else if (filterReview === 'flagged') rows = rows.filter((t) => t.needsReview);
    if (filterCategory !== 'all') rows = rows.filter((t) => t.category === filterCategory);
    if (filterConfidence === 'low') rows = rows.filter((t) => t.confidence < 0.78);
    if (filterConfidence === 'medium')
      rows = rows.filter((t) => t.confidence >= 0.78 && t.confidence < 0.9);
    if (filterConfidence === 'high') rows = rows.filter((t) => t.confidence >= 0.9);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((t) =>
        [t.externalId, t.description, t.counterparty, t.category].some((x) =>
          String(x || '')
            .toLowerCase()
            .includes(q)
        )
      );
    }
    return rows.sort((a, b) => {
      let av =
        sort.key === 'date'
          ? new Date(a.date).getTime()
          : sort.key === 'amount'
            ? Number(a.amount)
            : sort.key === 'confidence'
              ? Number(a.confidence)
              : String(a[sort.key] || '').toLowerCase();
      let bv =
        sort.key === 'date'
          ? new Date(b.date).getTime()
          : sort.key === 'amount'
            ? Number(b.amount)
            : sort.key === 'confidence'
              ? Number(b.confidence)
              : String(b[sort.key] || '').toLowerCase();
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
  }, [txns, month, active, filterReview, filterCategory, filterConfidence, query, sort]);
  const pageSize = 14,
    pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(
    () => setPage(1),
    [query, month, filterCategory, filterReview, filterConfidence, active]
  );
  const pushToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };
  const openEvidence = (rows) => {
    setLastEvidence(rows || []);
    setActive('AI Analyst');
  };

  const onUpload = async (chosen) => {
    if (!chosen) return;
    setFile(chosen);
    setBusy(true);
    setError('');
    setPreview(null);
    setImportSummary(null);
    try {
      const result = await previewImport(chosen);
      setPreview(result);
      setActive('Import');
    } catch (e) {
      setError(e.message);
      setActive('Import');
    } finally {
      setBusy(false);
    }
  };
  const doImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError('');
    try {
      const summary = await confirmImport(preview.batchId, allowExternalAI);
      setImportSummary(summary);
      setPreview(null);
      await refresh();
      setActive('Transactions');
      pushToast(
        `${summary.importedRows} transaction${summary.importedRows === 1 ? '' : 's'} imported`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };
  const saveCorrection = async (row, category, reason) => {
    await correctTransaction(idOf(row), category, reason);
    setSelected(null);
    await refresh();
    pushToast('Correction saved to MongoDB');
  };
  const resolveReview = async (row, resolved = true) => {
    await setReviewed(idOf(row), resolved);
    setSelected(null);
    await refresh();
    pushToast(resolved ? 'Marked reviewed' : 'Returned to review queue');
  };
  const askQuestion = async (value = ask) => {
    const question = value.trim();
    if (!question || askBusy) return;
    setAsk(question);
    setAskBusy(true);
    try {
      const result = await askAnalyst(question, useExternalAI);
      setMessages((prev) => [...prev, { question, result }]);
      setLastEvidence(result.evidence || []);
      setAsk('');
    } catch (e) {
      setError(e.message);
    } finally {
      setAskBusy(false);
    }
  };

  const nav = [
    ['Overview', 'grid'],
    ['Transactions', 'receipt'],
    ['Profit & Loss', 'chart'],
    ['Variances', 'chart'],
    ['Needs Review', 'alert'],
    ['AI Analyst', 'spark'],
    ['Import', 'upload'],
  ];
  return (
    <div className="finz-app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActive('Overview');
          }}
        >
          <span className="brand-icon">f</span>
          <span>
            finz<span className="brand-dot">.</span>
          </span>
        </a>
        <button className="workspace-switch" onClick={() => setActive('Overview')}>
          <span className="workspace-avatar">N</span>
          <span className="workspace-text">
            <strong>NYC Restaurant Co.</strong>
            <small>Finance workspace</small>
          </span>
          <Icon name="chevron" size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {nav.map(([name, icon]) => (
            <button
              key={name}
              className={`nav-item ${active === name ? 'selected' : ''}`}
              onClick={() => {
                setActive(name);
                if (name === 'Needs Review') setFilterReview('unresolved');
                else if (name === 'Transactions') setFilterReview('all');
              }}
            >
              <Icon name={icon} />
              <span>{name}</span>
              {name === 'Needs Review' && <em>{reviewRows.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-card">
            <span className="trust-icon">
              <Icon name="check" size={15} />
            </span>
            <span>
              <strong>Numbers you can trace</strong>
              <small>Every total links to its source transactions.</small>
            </span>
          </div>
          <div className="profile">
            <span className="profile-avatar">JD</span>
            <span>
              <strong>Jordan Davis</strong>
              <small>Restaurant owner</small>
            </span>
            <button className="dots" aria-label="Profile menu">
              ···
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{active}</strong>
          </div>
          <div className="top-actions">
            {months.length > 0 && !['Import', 'AI Analyst'].includes(active) && (
              <label className="period-select">
                <span>Period</span>
                <select value={month || months.at(-1)} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {labelMonth(m)}
                    </option>
                  ))}
                </select>
                <Icon name="chevron" size={13} />
              </label>
            )}
            <span className={`data-status ${error ? 'status-error' : ''}`}>
              <i />
              {error
                ? 'API needs attention'
                : busy
                  ? 'Updating ledger'
                  : `${txns.length} transactions`}
            </span>
            <button
              className="icon-button"
              title="Open AI analyst"
              onClick={() => setActive('AI Analyst')}
            >
              <Icon name="spark" />
            </button>
            <span className="avatar-small">JD</span>
          </div>
        </header>
        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                FINANCIAL REVIEW <span>·</span> {txns.length} SOURCE TRANSACTIONS
              </div>
              <h1>
                {active === 'Overview'
                  ? 'Good morning, Jordan'
                  : active === 'Profit & Loss'
                    ? 'Profit & loss'
                    : active}
              </h1>
              <p>
                {active === 'Overview'
                  ? `A clear view of your restaurant’s finances for ${labelMonth(month)}.`
                  : active === 'Transactions'
                    ? 'Explore the source ledger and investigate every classification.'
                    : active === 'Needs Review'
                      ? 'Resolve accounting questions and improve the accuracy of your review.'
                      : active === 'Variances'
                        ? 'Compare periods and inspect the categories behind material changes.'
                        : active === 'AI Analyst'
                          ? 'Ask a financial question and follow the evidence to its source.'
                          : active === 'Import'
                            ? 'Bring in a bank transaction file, validate it, then import.'
                            : `Calculated from transaction rows for ${labelMonth(month)}.`}
              </p>
            </div>
            {active !== 'Import' && (
              <button className="button-primary" onClick={() => setActive('Import')}>
                <Icon name="upload" size={16} /> Import transactions
              </button>
            )}
          </section>
          {error && (
            <div className="error-banner">
              <Icon name="alert" size={17} />
              <span>{error}</span>
              <button
                onClick={() => {
                  setError('');
                  refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {busy && !data ? (
            <div className="loading-card">
              <span className="spinner" /> Connecting to your financial workspace…
            </div>
          ) : !data && !busy ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="chart" size={22} />
              </div>
              <h2>Connect your financial workspace</h2>
              <p>
                {error ||
                  'Start the Express API and MongoDB, then import the restaurant transactions file.'}
              </p>
              <button
                className="button-primary"
                onClick={() => {
                  setError('');
                  refresh();
                }}
              >
                Retry connection
              </button>
              <button className="button-quiet" onClick={() => setActive('Import')}>
                Open import workflow
              </button>
            </div>
          ) : (
            <>
              {active === 'Overview' && (
                <Overview
                  data={data}
                  month={month}
                  pnl={selectedPnl}
                  previous={previous}
                  variance={variance}
                  reviewRows={reviewRows}
                  recentRows={recentRows}
                  onNavigate={setActive}
                  onSelect={setSelected}
                  onMonth={setMonth}
                  onVariance={setInspectedVariance}
                />
              )}
              {active === 'Profit & Loss' && (
                <PnlPage data={data} onEvidence={openEvidence} onMonth={setMonth} />
              )}
              {active === 'Variances' && (
                <VariancesPage
                  data={data}
                  selected={selectedVariance}
                  setSelected={setInspectedVariance}
                  onEvidence={openEvidence}
                  onSelect={setSelected}
                />
              )}
              {(active === 'Transactions' || active === 'Needs Review') && (
                <Explorer
                  title={
                    active === 'Needs Review' ? 'Transactions to review' : 'Transaction ledger'
                  }
                  subtitle={`${filteredRows.length} transactions${active === 'Needs Review' ? ' need your attention' : ' in the current period'}.`}
                  rows={pageRows}
                  page={page}
                  pageCount={pageCount}
                  total={filteredRows.length}
                  query={query}
                  setQuery={setQuery}
                  category={filterCategory}
                  setCategory={setFilterCategory}
                  review={filterReview}
                  setReview={setFilterReview}
                  confidence={filterConfidence}
                  setConfidence={setFilterConfidence}
                  sort={sort}
                  onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}
                  onSelect={setSelected}
                  onPage={setPage}
                  onImport={() => setActive('Import')}
                  reviewMode={active === 'Needs Review'}
                />
              )}
              {active === 'Import' && (
                <ImportPage
                  data={data}
                  preview={preview}
                  summary={importSummary}
                  busy={busy}
                  importing={importing}
                  allowExternalAI={allowExternalAI}
                  setAllowExternalAI={setAllowExternalAI}
                  onUpload={onUpload}
                  onConfirm={doImport}
                  onCancelPreview={() => setPreview(null)}
                  onChoose={() => document.getElementById('transaction-file')?.click()}
                />
              )}
              {active === 'AI Analyst' && (
                <AnalystPage
                  messages={messages}
                  ask={ask}
                  setAsk={setAsk}
                  busy={askBusy}
                  useExternalAI={useExternalAI}
                  setUseExternalAI={setUseExternalAI}
                  configuredAI={data?.configuredAI}
                  evidence={lastEvidence}
                  onAsk={askQuestion}
                  onSelect={setSelected}
                  onSuggested={(q) => askQuestion(q)}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              Finz <b>·</b> explainable financial review
            </span>
            <span>
              {data ? `${txns.length} transactions stored in MongoDB` : 'MongoDB-backed workspace'}
            </span>
          </footer>
        </div>
      </main>
      {active !== 'AI Analyst' && (
        <button className="ask-button" onClick={() => setActive('AI Analyst')}>
          <span>
            <Icon name="spark" size={17} />
          </span>{' '}
          Ask your analyst
        </button>
      )}
      <input
        id="transaction-file"
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        hidden
        onChange={(e) => {
          onUpload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {selected && (
        <TransactionModal
          row={selected}
          onClose={() => setSelected(null)}
          onSave={saveCorrection}
          onReview={resolveReview}
        />
      )}
      {preview && (
        <ImportPreview
          preview={preview}
          file={file}
          allowExternalAI={allowExternalAI}
          setAllowExternalAI={setAllowExternalAI}
          importing={importing}
          onImport={doImport}
          onClose={() => setPreview(null)}
        />
      )}
      {toast && (
        <div className="toast">
          <Icon name="check" size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Overview({
  data,
  month,
  pnl,
  previous,
  variance,
  reviewRows,
  recentRows,
  onNavigate,
  onSelect,
  onMonth,
  onVariance,
}) {
  const totals = pnl || {};
  const drivers = variance?.drivers || [];
  return (
    <>
      <div className="metric-grid">
        <Metric
          label="Revenue"
          value={money(totals.revenue, true)}
          icon="↗"
          tint="green"
          change={
            previous
              ? `${signedMoney(totals.revenue - previous.revenue)} vs ${labelMonth(previous.month, true)}`
              : 'From classified ledger'
          }
          positive={!previous || totals.revenue >= previous.revenue}
        />
        <Metric
          label="Gross profit"
          value={money(totals.grossProfit, true)}
          icon="◒"
          tint="blue"
          change={`${percent(totals.grossMargin)} gross margin`}
        />
        <Metric
          label="Payroll"
          value={money(totals.payroll, true)}
          icon="♧"
          tint="violet"
          change={`${payrollCount(data.transactions, month)} payroll rows`}
        />
        <Metric
          label="Operating profit"
          value={money(totals.operatingProfit, true)}
          icon="↗"
          tint="amber"
          change={
            previous
              ? `${signedMoney(totals.operatingProfit - previous.operatingProfit)} vs prior month`
              : 'Calculated P&L'
          }
          positive={!previous || totals.operatingProfit >= previous.operatingProfit}
        />
      </div>
      <div className="overview-grid">
        <section className="panel pnl-panel">
          <div className="panel-head">
            <div>
              <h2>Monthly performance</h2>
              <p>Calculated from the classified transaction ledger</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('Profit & Loss')}>
              Open P&L <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-green" />
              Revenue
            </span>
            <span>
              <i className="legend-gray" />
              Costs
            </span>
            <span>
              <i className="legend-violet" />
              Operating profit
            </span>
          </div>
          <div className="chart-area">
            <div className="y-labels">
              <span>{money(Math.max(...data.pnl.map((p) => p.revenue), 1), true)}</span>
              <span>{money(Math.max(...data.pnl.map((p) => p.revenue), 1) * 0.66, true)}</span>
              <span>{money(Math.max(...data.pnl.map((p) => p.revenue), 1) * 0.33, true)}</span>
              <span>$0</span>
            </div>
            <div className="chart-bars">
              {data.pnl.map((p) => {
                const max = Math.max(...data.pnl.map((x) => x.revenue), 1);
                return (
                  <button
                    key={p.month}
                    className={`bar-group ${p.month === month ? 'bar-active' : ''}`}
                    onClick={() => onMonth(p.month)}
                    aria-label={`${labelMonth(p.month)} revenue ${money(p.revenue)}`}
                  >
                    <div className="bars">
                      <span
                        className="bar bar-revenue"
                        style={{ height: `${Math.max(4, (p.revenue / max) * 100)}%` }}
                      />
                      <span
                        className="bar bar-cost"
                        style={{
                          height: `${Math.max(4, ((p.cogs + p.payroll + p.operatingExpenses) / max) * 100)}%`,
                        }}
                      />
                      <span
                        className="bar bar-profit"
                        style={{
                          height: `${Math.max(3, (Math.max(0, p.operatingProfit) / max) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="bar-label">{labelMonth(p.month, true)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="chart-foot">
            <span>Operating margin · {labelMonth(month, true)}</span>
            <b>{percent(totals.operatingMargin)}</b>
            <span className="chart-foot-note">Click a month to update the review</span>
          </div>
        </section>
        <section className="panel insight-panel">
          <div className="panel-head">
            <div>
              <h2>Review highlights</h2>
              <p>
                {variance
                  ? `${labelMonth(variance.from)} → ${labelMonth(variance.to)}`
                  : 'The imported review period'}
              </p>
            </div>
            <span className="ai-chip">
              <Icon name="spark" size={13} /> VERIFIED
            </span>
          </div>
          {variance ? (
            <>
              <div className="insight-lead">
                Operating profit{' '}
                <b
                  className={
                    variance.metrics.find((x) => x.metric === 'operatingProfit')?.change >= 0
                      ? 'positive'
                      : 'negative'
                  }
                >
                  {variance.metrics.find((x) => x.metric === 'operatingProfit')?.change >= 0
                    ? 'rose'
                    : 'fell'}{' '}
                  {money(
                    Math.abs(
                      variance.metrics.find((x) => x.metric === 'operatingProfit')?.change || 0
                    )
                  )}
                </b>
              </div>
              <p className="insight-copy">
                Largest calculated category movements, ranked by absolute change:
              </p>
              <div className="driver-list">
                {drivers.slice(0, 3).map((d) => (
                  <button
                    className="driver driver-button"
                    key={d.category}
                    onClick={() => {
                      onVariance(variance);
                      onNavigate('Variances');
                    }}
                  >
                    <i className="driver-dot" />
                    <span className="driver-name">{d.category}</span>
                    <b className={d.change >= 0 ? 'negative' : 'positive'}>
                      {d.change >= 0 ? '+' : '−'}
                      {money(Math.abs(d.change), true)}
                    </b>
                  </button>
                ))}
              </div>
              <button
                className="evidence-link"
                onClick={() => {
                  onVariance(variance);
                  onNavigate('Variances');
                }}
              >
                Inspect variance drivers <Icon name="arrow" size={14} />
              </button>
            </>
          ) : (
            <p className="insight-copy">
              Import another month of transactions to calculate period-over-period variance drivers.
            </p>
          )}
          <div className="review-callout">
            <span className="review-callout-icon">
              <Icon name="alert" size={16} />
            </span>
            <span>
              <strong>{reviewRows.length} items need review</strong>
              <small>Transactions requiring a judgment call or confirmation</small>
            </span>
            <button onClick={() => onNavigate('Needs Review')}>
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="panel transactions-panel">
          <div className="panel-head">
            <div>
              <h2>Recent transactions</h2>
              <p>Latest activity in the source ledger</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('Transactions')}>
              All transactions <Icon name="arrow" size={14} />
            </button>
          </div>
          <TransactionTable rows={recentRows} onSelect={onSelect} />
        </section>
        <section className="panel review-panel">
          <div className="panel-head">
            <div>
              <h2>Needs your attention</h2>
              <p>Check accounting treatment before sign-off</p>
            </div>
            <span className="count-pill">{reviewRows.length}</span>
          </div>
          {reviewRows.slice(0, 4).map((t) => (
            <button className="review-row" key={idOf(t)} onClick={() => onSelect(t)}>
              <span className="review-dot" />
              <span>
                <strong>{t.description}</strong>
                <small>
                  {shortDate(t.date)} · {t.counterparty}
                </small>
              </span>
              <b>{money(t.amount)}</b>
            </button>
          ))}
          {!reviewRows.length && (
            <div className="review-empty">
              <Icon name="check" size={17} /> No open review items
            </div>
          )}
          <button className="review-all" onClick={() => onNavigate('Needs Review')}>
            Open review queue <Icon name="arrow" size={14} />
          </button>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, icon, tint, change, positive }) {
  return (
    <section className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tint}`}>{icon}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-change">
        {positive !== undefined && (
          <i className={positive ? 'positive' : 'negative'}>{positive ? '↗' : '↘'}</i>
        )}
        {change}
      </div>
    </section>
  );
}
function payrollCount(transactions = [], month) {
  return transactions.filter(
    (t) => (!month || String(t.date).slice(0, 7) === month) && /Payroll/.test(t.category)
  ).length;
}
function signedMoney(n) {
  return `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
}
function TransactionTable({ rows, onSelect, compact = false, sortable, onSort }) {
  return (
    <div className="table-scroll">
      <table className={`transaction-table ${compact ? 'compact-table' : ''}`}>
        <thead>
          <tr>
            {[
              ['description', 'TRANSACTION'],
              ['date', 'DATE'],
              ['category', 'CATEGORY'],
              ['counterparty', 'COUNTERPARTY'],
              ['amount', 'AMOUNT'],
            ].map(([key, label]) => (
              <th
                key={key}
                className={key === 'amount' ? 'amount-cell' : ''}
                onClick={() => onSort?.(key)}
              >
                {label}
                {sortable && <span className="sort-mark">↕</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((t) => (
              <tr key={idOf(t)} onClick={() => onSelect(t)}>
                <td>
                  <span className={`txn-glyph ${t.amount >= 0 ? 'incoming' : 'outgoing'}`}>
                    {t.amount >= 0 ? '↙' : '↗'}
                  </span>
                  <span className="txn-title">
                    <strong>{t.description}</strong>
                    {!compact && (
                      <small>
                        {t.externalId} · {t.paymentMethod || 'Method not provided'} ·{' '}
                        {t.classificationMethod || 'Unclassified'} ·{' '}
                        {percent((t.confidence || 0) * 100)} confidence
                      </small>
                    )}
                  </span>
                </td>
                <td>{shortDate(t.date)}</td>
                <td>
                  <span className={`category-tag ${tagClass(t.category)}`}>{t.category}</span>
                  {t.needsReview && !compact && (
                    <span className="review-indicator">
                      {t.reviewed ? ' Reviewed' : ' Needs review'}
                    </span>
                  )}
                </td>
                <td className="counterparty">{t.counterparty || '—'}</td>
                <td className={`amount-cell ${t.amount >= 0 ? 'amount-in' : ''}`}>
                  {money(t.amount)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="no-rows">
                No transactions match those filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function tagClass(category) {
  if (
    [
      'Food Sales',
      'Beverage Sales',
      'Catering Revenue',
      'Delivery Revenue',
      'Other Revenue',
    ].includes(category)
  )
    return 'tag-green';
  if (
    [
      'Food & Ingredients',
      'Beverage Inventory',
      'Packaging & Disposables',
      'Sales Returns & Discounts',
    ].includes(category)
  )
    return 'tag-blue';
  if (category.startsWith('Payroll')) return 'tag-violet';
  if (
    !category ||
    category === 'Needs Review' ||
    [
      'Gift Card Liability',
      'Sales Tax Payable',
      'Equipment / Capital Purchase',
      'Loan Principal',
      'Owner Distribution',
    ].includes(category)
  )
    return 'tag-amber';
  return 'tag-gray';
}

function Explorer({
  title,
  subtitle,
  rows,
  page,
  pageCount,
  total,
  query,
  setQuery,
  category,
  setCategory,
  review,
  setReview,
  confidence,
  setConfidence,
  sort,
  onSort,
  onSelect,
  onPage,
  onImport,
  reviewMode,
}) {
  return (
    <section className="panel full-table-panel">
      <div className="panel-head table-controls">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="filters">
          <label className="search-box">
            <Icon name="search" size={16} />
            <input
              placeholder="Search ledger…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="all">All confidence</option>
            <option value="low">Low (&lt;78%)</option>
            <option value="medium">Medium (78–89%)</option>
            <option value="high">High (90%+)</option>
          </select>
          <select value={review} onChange={(e) => setReview(e.target.value)}>
            <option value={reviewMode ? 'unresolved' : 'all'}>All review status</option>
            <option value="unresolved">Needs review</option>
            <option value="reviewed">Reviewed</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>
      </div>
      <TransactionTable rows={rows} onSelect={onSelect} sortable onSort={onSort} />
      <div className="table-footer">
        <span>
          Showing {total ? (page - 1) * 14 + 1 : 0}–{Math.min(page * 14, total)} of {total}{' '}
          transactions
        </span>
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
      {!total && (
        <button className="text-button" onClick={onImport}>
          Import a transaction file <Icon name="arrow" size={14} />
        </button>
      )}
      {sort && (
        <span className="sr-only">
          Sorted by {sort.key}, {sort.dir === 1 ? 'ascending' : 'descending'}
        </span>
      )}
    </section>
  );
}

function PnlPage({ data, onEvidence, onMonth }) {
  const [line, setLine] = useState(null);
  const lineNames = [
    ['revenue', 'Revenue'],
    ['cogs', 'Cost of goods sold'],
    ['grossProfit', 'Gross profit'],
    ['payroll', 'Payroll'],
    ['operatingExpenses', 'Operating expenses'],
    ['operatingProfit', 'Operating profit'],
  ];
  const evidence = line
    ? (data.transactions || []).filter(
        (t) =>
          String(t.date).slice(0, 7) === line.month &&
          (line.category ? t.category === line.category : PNLCategory(t.category, line.line))
      )
    : [];
  return (
    <div className="pnl-layout">
      <section className="panel full-table-panel">
        <div className="panel-head">
          <div>
            <h2>Monthly statement</h2>
            <p>
              Income recognized from deposits; expenses from negative bank entries, shown positive
              in cost lines. Click a figure to inspect evidence.
            </p>
          </div>
          <span className="method-pill">DETERMINISTIC · MONGODB</span>
        </div>
        <div className="table-scroll">
          <table className="transaction-table pnl-table">
            <thead>
              <tr>
                <th>PERIOD / ACCOUNT</th>
                {lineNames.map(([, title]) => (
                  <th key={title} className="amount-cell">
                    {title.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.pnl.map((p) => (
                <tr className="pnl-month-row" key={p.month}>
                  <td onClick={() => onMonth(p.month)}>
                    <strong>{labelMonth(p.month)}</strong>
                  </td>
                  {lineNames.map(([key]) => (
                    <td
                      key={key}
                      className="amount-cell"
                      onClick={() => setLine({ month: p.month, line: key })}
                    >
                      <button className="pnl-cell-button">{money(p[key])}</button>
                    </td>
                  ))}
                </tr>
              ))}
              {data.pnl.length === 0 && (
                <tr>
                  <td colSpan="7" className="no-rows">
                    Import transactions to build a monthly P&L.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pnl-note">
          <Icon name="check" size={15} /> Refunds and discounts reduce revenue. Gift cards, sales
          tax remittances, loan principal, owner distributions, and equipment purchases are excluded
          from operating P&L and shown in Needs Review.
        </div>
      </section>
      {line && (
        <section className="panel evidence-panel">
          <div className="panel-head">
            <div>
              <h2>{lineTitle(line.line)} evidence</h2>
              <p>{labelMonth(line.month)} · source transactions</p>
            </div>
            <button className="close-button" onClick={() => setLine(null)}>
              <Icon name="close" />
            </button>
          </div>
          <TransactionTable
            rows={evidence.slice(0, 50)}
            compact
            onSelect={(t) => onEvidence([t])}
          />
          <div className="evidence-summary">
            {evidence.length} source rows · total{' '}
            {money(
              lineValue(
                data.pnl.find((p) => p.month === line.month),
                line.line
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
function PNLCategory(category, line) {
  const map = {
    revenue: [
      'Food Sales',
      'Beverage Sales',
      'Catering Revenue',
      'Delivery Revenue',
      'Other Revenue',
      'Sales Returns & Discounts',
    ],
    cogs: ['Food & Ingredients', 'Beverage Inventory', 'Packaging & Disposables'],
    grossProfit: [
      'Food Sales',
      'Beverage Sales',
      'Catering Revenue',
      'Delivery Revenue',
      'Other Revenue',
      'Sales Returns & Discounts',
      'Food & Ingredients',
      'Beverage Inventory',
      'Packaging & Disposables',
    ],
    payroll: ['Payroll Wages', 'Payroll Taxes & Benefits'],
    operatingExpenses: CATEGORIES.slice(11, 22),
    operatingProfit: CATEGORIES.slice(0, 22),
  };
  return map[line]?.includes(category);
}
function lineTitle(line) {
  return (
    {
      revenue: 'Revenue',
      cogs: 'Cost of goods sold',
      grossProfit: 'Gross profit',
      payroll: 'Payroll',
      operatingExpenses: 'Operating expenses',
      operatingProfit: 'Operating profit',
    }[line] || line
  );
}
function lineValue(row, line) {
  return row?.[line] || 0;
}

function VariancesPage({ data, selected, setSelected, onEvidence, onSelect }) {
  const variances = data.variances || [];
  if (!variances.length)
    return (
      <section className="panel empty-state">
        <h2>Two periods are needed for variance analysis</h2>
        <p>
          Import transactions covering another month. Variances are calculated from adjacent months
          present in the database.
        </p>
      </section>
    );
  const current = selected || variances.at(-1);
  const metric = current.metrics.find((x) => x.metric === 'operatingProfit');
  const drivers = current.drivers || [];
  const rows = (data.transactions || []).filter((t) =>
    [current.from, current.to].includes(String(t.date).slice(0, 7))
  );
  return (
    <div className="variance-layout">
      <section className="panel full-table-panel">
        <div className="panel-head">
          <div>
            <h2>Period comparisons</h2>
            <p>
              A variance is material when its absolute change is at least $500 and its relative
              change is at least 10%.
            </p>
          </div>
          <span className="method-pill">DETERMINISTIC RULE</span>
        </div>
        <div className="variance-periods">
          {variances.map((v) => {
            const op = v.metrics.find((x) => x.metric === 'operatingProfit');
            return (
              <button
                key={v.to}
                className={`variance-period ${current.to === v.to ? 'active' : ''}`}
                onClick={() => setSelected(v)}
              >
                <span>
                  {labelMonth(v.from, true)} <b>→</b> {labelMonth(v.to, true)}
                </span>
                <strong className={op.change >= 0 ? 'positive' : 'negative'}>
                  {signedMoney(op.change)}
                </strong>
                <small>{v.materialVariances.length} material changes · operating profit</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="panel variance-detail">
        <div className="variance-detail-heading">
          <div>
            <span className="eyebrow">VARIANCE ANALYSIS</span>
            <h2>
              {labelMonth(current.from)} → {labelMonth(current.to)}
            </h2>
          </div>
          <span className={metric.material ? 'material-pill' : 'method-pill'}>
            {metric.material ? 'MATERIAL' : 'BELOW MATERIALITY'}
          </span>
        </div>
        <div className="variance-callout">
          <span>Operating profit</span>
          <div>
            <strong>{money(metric.current)}</strong>
            <small>from {money(metric.previous)}</small>
          </div>
          <b className={metric.change >= 0 ? 'positive' : 'negative'}>
            {signedMoney(metric.change)}{' '}
            <small>
              {metric.percent === null
                ? 'new period'
                : `${metric.percent >= 0 ? '+' : ''}${metric.percent.toFixed(1)}%`}
            </small>
          </b>
        </div>
        <h3>Category movements</h3>
        <p className="muted-copy">
          Categories are compared on recorded transaction totals. Cost increases appear as positive
          movements and reduce operating profit.
        </p>
        <div className="driver-table">
          {drivers.slice(0, 12).map((d) => (
            <button
              className="driver-table-row"
              key={d.category}
              onClick={() => onEvidence(rows.filter((t) => t.category === d.category))}
            >
              <span>
                <strong>{d.category}</strong>
                <small>
                  {money(d.previous)} → {money(d.current)}
                </small>
              </span>
              <b className={d.change > 0 ? 'negative' : 'positive'}>{signedMoney(d.change)}</b>
              <Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
        <button className="button-primary" onClick={() => onEvidence(rows)}>
          Show transactions behind the variance <Icon name="arrow" size={14} />
        </button>
      </section>
      <section className="panel variance-evidence">
        <div className="panel-head">
          <div>
            <h2>Source transactions</h2>
            <p>{rows.length} rows across both periods</p>
          </div>
        </div>
        <TransactionTable rows={rows.slice(0, 8)} onSelect={onSelect} compact />
        <button className="text-button" onClick={() => onEvidence(rows)}>
          Open full evidence <Icon name="arrow" size={14} />
        </button>
      </section>
    </div>
  );
}

function ImportPage({
  data,
  preview,
  summary,
  busy,
  importing,
  allowExternalAI,
  setAllowExternalAI,
  onUpload,
  onConfirm,
  onCancelPreview,
  onChoose,
}) {
  const batches = data?.latestBatch ? [data.latestBatch] : [];
  return (
    <div className="import-layout">
      <section className="panel import-drop-panel">
        <div className="upload-orbit">
          <Icon name="upload" size={23} />
        </div>
        <h2>Import bank transactions</h2>
        <p>
          Upload a CSV or Excel file. We’ll check its columns, amounts, dates and duplicates before
          saving any rows.
        </p>
        <button className="button-primary" disabled={busy} onClick={onChoose}>
          {busy ? 'Validating file…' : 'Choose a file'}
        </button>
        <span className="file-types">CSV · XLSX · XLS · up to 10 MB</span>
        <div className="import-checks">
          <span>
            <Icon name="check" size={14} /> Preview before saving
          </span>
          <span>
            <Icon name="check" size={14} /> Duplicate detection
          </span>
          <span>
            <Icon name="check" size={14} /> Invalid rows reported
          </span>
        </div>
      </section>
      <section className="panel import-guide">
        <span className="eyebrow">SUPPORTED COLUMNS</span>
        <h2>Use a bank export with</h2>
        <div className="column-list">
          {[
            ['Required', 'Date, description, amount'],
            ['Recommended', 'Transaction ID, counterparty'],
            ['Optional', 'Payment method / account'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="privacy-note">
          <Icon name="spark" size={15} />
          <span>
            Automatic categories use local rules. Hosted AI is optional and only sees unfamiliar
            transaction description, counterparty and amount after you opt in.
          </span>
        </div>
      </section>
      {summary && (
        <section className="panel import-summary">
          <div className="panel-head">
            <div>
              <h2>Last import</h2>
              <p>{summary.sourceFile}</p>
            </div>
            <span className="ai-chip">
              <Icon name="check" size={13} /> IMPORTED
            </span>
          </div>
          <ImportStats values={summary} />
        </section>
      )}
      {batches.length > 0 && !summary && (
        <section className="panel import-summary">
          <div className="panel-head">
            <div>
              <h2>Latest saved batch</h2>
              <p>{batches[0].sourceFile}</p>
            </div>
            <span className="count-pill">{batches[0].importedRows} rows</span>
          </div>
          <p className="muted-copy">
            An import batch is stored in MongoDB and can be reviewed from the transaction ledger.
          </p>
        </section>
      )}
    </div>
  );
}
function ImportPreview({
  preview,
  file,
  allowExternalAI,
  setAllowExternalAI,
  importing,
  onImport,
  onClose,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="detail-modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <span className="eyebrow">IMPORT PREVIEW</span>
            <h2>{file?.name || preview.sourceFile}</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <ImportStats
          values={{
            totalRows: preview.totalRows,
            importedRows: preview.validRows,
            duplicateRows: preview.duplicateRows,
            invalidRows: preview.invalidRows,
            categorizedRows: preview.classifiedRows,
            reviewRows: preview.reviewRows,
          }}
        />
        <h3>Preview rows</h3>
        <TransactionTable
          rows={preview.preview.map((t, i) => ({ ...t, _id: t.externalId || i }))}
          compact
          onSelect={() => {}}
        />
        <div className="import-errors">
          {preview.errors.length > 0 && (
            <details>
              <summary>{preview.errors.length} invalid rows · inspect validation errors</summary>
              {preview.errors.slice(0, 20).map((e) => (
                <p key={e.row}>
                  Row {e.row}: {e.message}
                </p>
              ))}
            </details>
          )}
        </div>
        {preview.reviewRows > 0 && (
          <label className="external-ai-consent">
            <input
              type="checkbox"
              checked={allowExternalAI}
              onChange={(e) => setAllowExternalAI(e.target.checked)}
            />
            <span>
              <strong>Use Groq AI to classify only unfamiliar rows</strong>
              <small>
                If configured, sends those rows’ descriptions, counterparties, and amounts to Groq.
                Unchecked means they stay in the review queue.
              </small>
            </span>
          </label>
        )}
        <div className="detail-actions">
          <button className="button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" onClick={onImport} disabled={importing}>
            {importing
              ? 'Importing…'
              : `Import ${preview.validRows - preview.duplicateRows} transactions`}
          </button>
        </div>
      </section>
    </div>
  );
}
function ImportStats({ values }) {
  return (
    <div className="import-stats">
      {[
        ['Rows found', values.totalRows],
        ['Will import / imported', values.importedRows],
        ['Duplicates', values.duplicateRows],
        ['Invalid rows', values.invalidRows],
        ['Classified', values.categorizedRows],
        ['Needs review', values.reviewRows],
      ].map(([label, value]) => (
        <div key={label}>
          <strong>{value ?? 0}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function AnalystPage({
  messages,
  ask,
  setAsk,
  busy,
  useExternalAI,
  setUseExternalAI,
  configuredAI,
  evidence,
  onAsk,
  onSelect,
  onSuggested,
}) {
  const prompts = [
    'What was our revenue in March?',
    'How much did we spend on payroll each month?',
    'Why did operating profit change between February and March?',
    'What drove the increase in food costs?',
    'Which transactions need my attention?',
  ];
  return (
    <div className="analyst-layout">
      <section className="panel analyst-main">
        <div className="analyst-header">
          <div className="analyst-mark">
            <Icon name="spark" size={17} />
          </div>
          <div>
            <h2>Financial analyst</h2>
            <p>
              <i /> Grounded in structured financial queries
            </p>
          </div>
          <span className="method-pill">
            {configuredAI ? 'OPTIONAL GROQ' : 'LOCAL QUERY ENGINE'}
          </span>
        </div>
        <div className="conversation">
          {messages.length === 0 ? (
            <div className="analyst-welcome">
              <span className="welcome-spark">
                <Icon name="spark" size={20} />
              </span>
              <h2>Investigate your financials.</h2>
              <p>
                Ask a question. The API runs a controlled financial query, calculates the answer
                from MongoDB, and attaches the source rows.
              </p>
              <div className="prompt-grid">
                {prompts.map((q) => (
                  <button key={q} onClick={() => onSuggested(q)}>
                    {q}
                    <Icon name="arrow" size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div className="conversation-turn" key={`${i}-${m.question}`}>
                <div className="user-question">{m.question}</div>
                <div className="analyst-answer">
                  <span className="answer-label">
                    <Icon name="spark" size={13} />{' '}
                    {m.result.explanationProvider === 'groq'
                      ? 'VERIFIED RESULT · AI REPHRASE'
                      : 'DETERMINISTIC QUERY · VERIFIED RESULT'}
                  </span>
                  <h3>{m.result.title}</h3>
                  <p>{m.result.answer}</p>
                  {m.result.explanation && (
                    <p className="muted-copy">AI explanation: {m.result.explanation}</p>
                  )}
                  <div className="query-meta">
                    <code>{m.result.operation}</code>
                    <span>{m.result.evidenceCount || 0} evidence rows</span>
                  </div>
                  {m.result.evidence?.length > 0 && (
                    <div className="answer-evidence">
                      <strong>
                        Source evidence <span>{m.result.evidenceCount}</span>
                      </strong>
                      {m.result.evidence.slice(0, 8).map((t) => (
                        <button key={idOf(t)} onClick={() => onSelect(t)}>
                          <span>
                            <b>{t.externalId}</b> · {String(t.date).slice(0, 10)} · {t.description}
                          </span>
                          <strong>{money(t.amount)}</strong>
                        </button>
                      ))}
                      {m.result.evidenceCount > m.result.evidence.length && (
                        <small>
                          First {m.result.evidence.length} of {m.result.evidenceCount} matching rows
                          are shown.
                        </small>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <form
          className="analyst-input"
          onSubmit={(e) => {
            e.preventDefault();
            onAsk(ask);
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask about revenue, costs, profit, or review items…"
          />
          <button disabled={busy || !ask.trim()} aria-label="Ask question">
            {busy ? <span className="spinner small" /> : <Icon name="arrow" size={17} />}
          </button>
        </form>
        <label className="external-ai-toggle">
          <input
            type="checkbox"
            checked={useExternalAI}
            onChange={(e) => setUseExternalAI(e.target.checked)}
          />
          <span>
            Use Groq to rephrase verified results{configuredAI ? '' : ' (API key not configured)'}
          </span>
          <small>
            Shares the question, computed summary and relevant transaction evidence with Groq; never
            arbitrary SQL or the full database.
          </small>
        </label>
      </section>
      <aside className="panel analyst-side">
        <span className="eyebrow">HOW ANSWERS ARE MADE</span>
        <h3>Query. Calculate. Trace.</h3>
        <div className="analysis-steps">
          {[
            ['01', 'Understand the question', 'A bounded intent map selects a financial query.'],
            ['02', 'Calculate on the API', 'The server computes totals from MongoDB categories.'],
            ['03', 'Return source evidence', 'Answers include transaction IDs, dates and amounts.'],
          ].map(([n, title, desc]) => (
            <div key={n}>
              <b>{n}</b>
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="safety-card">
          <Icon name="check" size={15} />
          <p>
            Financial amounts and drivers are calculated by backend functions. AI can only phrase
            those verified facts after you enable hosted explanations.
          </p>
        </div>
        {evidence.length > 0 && (
          <div className="latest-evidence">
            <span className="eyebrow">LATEST SOURCES · {evidence.length}</span>
            {evidence.slice(0, 8).map((t) => (
              <button key={idOf(t)} onClick={() => onSelect(t)}>
                <span>
                  <b>{t.externalId}</b>
                  <small>
                    {String(t.date).slice(0, 10)} · {t.category}
                  </small>
                </span>
                <strong>{money(t.amount)}</strong>
              </button>
            ))}
            {evidence.length > 8 && <small>Showing first 8 evidence rows.</small>}
          </div>
        )}
      </aside>
    </div>
  );
}

function TransactionModal({ row, onClose, onSave, onReview }) {
  const [category, setCategory] = useState(row.category);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(row, category, reason);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <span className="eyebrow">TRANSACTION DETAIL · {row.externalId}</span>
            <h2>{row.description}</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="detail-amount">
          {money(row.amount)}
          <span className={row.amount >= 0 ? 'amount-in' : 'negative'}>
            {row.amount >= 0 ? 'Money in' : 'Money out'}
          </span>
        </div>
        <div className="detail-fields">
          <div>
            <span>Transaction ID</span>
            <b>{row.externalId}</b>
          </div>
          <div>
            <span>Date</span>
            <b>
              {new Date(row.date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </b>
          </div>
          <div>
            <span>Counterparty</span>
            <b>{row.counterparty || 'Not provided'}</b>
          </div>
          <div>
            <span>Payment method</span>
            <b>{row.paymentMethod || 'Not provided'}</b>
          </div>
          <div>
            <span>Source file</span>
            <b>{row.sourceFile || 'Imported ledger'}</b>
          </div>
          <div>
            <span>Classification method</span>
            <b className="capitalized">{row.classificationMethod}</b>
          </div>
          <div className="category-field">
            <label htmlFor="category-select">Accounting category</label>
            <select
              id="category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="confidence-block">
            <span>Confidence score</span>
            <b>{percent((row.confidence || 0) * 100)}</b>
            <span className="confidence-track">
              <i style={{ width: `${Math.max(3, (row.confidence || 0) * 100)}%` }} />
            </span>
          </div>
        </div>
        <div className="classification-reason">
          <span className="ai-chip">
            <Icon name="spark" size={12} /> CLASSIFICATION REASON
          </span>
          <p>{row.classificationReason || 'No reasoning was recorded for this category.'}</p>
          {row.originalCategory && row.originalCategory !== row.category && (
            <small>
              Original classification: {row.originalCategory}. {row.corrections?.length || 0} saved
              correction(s).
            </small>
          )}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="detail-actions">
          <button className="button-quiet" onClick={() => onReview(row, !row.reviewed)}>
            {row.reviewed ? 'Return to review' : 'Mark reviewed'}
          </button>
          <button className="button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default App;
