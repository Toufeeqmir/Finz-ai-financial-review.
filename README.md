# Finz — AI-Native Financial Review

Finz turns restaurant bank transactions into an explainable monthly financial review. It is a standalone MERN application built from the FINZ internship assignment and the supplied NYC Restaurant Co. transaction file.

## What is implemented

- CSV and XLS/XLSX preview, validation, duplicate detection, and confirmed import.
- Restaurant chart of accounts with rule-based classification, confidence, reason, review flag, and optional AI fallback for unfamiliar rows.
- MongoDB persistence for imported transactions, classification corrections, review state, and import batches.
- Monthly P&L computed from transaction records, with clickable account totals and evidence rows.
- Adjacent-month variance analysis, a declared materiality rule, and category-level drivers.
- Transaction search, month/category/confidence/review filters, sorting, pagination, details, and classification corrections.
- A financial analyst interface backed by a fixed set of safe query operations. Every answer includes the matching transaction evidence.
- Optional Groq calls are server-side and disabled unless a user opts in for that request. The deterministic result remains the displayed answer.

## Stack and structure

- React 18, Vite, Axios
- Node.js 22, Express, Mongoose, MongoDB
- Multer, XLSX, Jest, Supertest
- Optional Groq SDK, with the key kept on the server

```text
finz-review-app/
├── client/
│   └── src/                 # React financial review UI and API client
├── server/
│   ├── data/                # Original supplied CSV, used by the optional seed command
│   ├── models/              # Mongoose Transaction and ImportBatch schemas
│   ├── routes/              # REST API
│   ├── services/            # Import, categorization, P&L, variance, corrections, analyst
│   ├── scripts/             # Optional dataset seed/import command
│   └── tests/               # Jest unit tests and Supertest API tests
├── render.yaml
└── README.md
```

The transaction collection is named `finz_transactions`; imports are stored in `finz_import_batches`. This keeps FINZ records distinct if the same MongoDB database is also used by another application.

## Dataset inspected

The [NYC Restaurant Co. raw transactions sheet](https://docs.google.com/spreadsheets/d/1LuN7YOQtQRmaYGToQHcTtifV0U72tdYE/edit?usp=sharing) has 181 data rows, six columns (`Transaction ID`, `Date`, `Description`, `Counterparty`, `Amount`, `Method`), dates from 2026-01-01 to 2026-03-31, dollar amounts with signed inflows/outflows, and seven observed payment-method labels. These counts are read from the supplied file by the importer; they are not application constants.

The sample dataset remains a CSV source file in `server/data`. The UI is not seeded with hard-coded transactions or precomputed results. Normal use starts with an empty MongoDB collection and imports a file through the preview flow. You may seed the database for local inspection using the command below.

## Local setup

Requirements: Node.js 22+, npm, and a local MongoDB service or a MongoDB Atlas connection string.

1. Open a terminal in `finz-review-app` and install the separate server and client dependencies:

   ```bash
   npm run install:all
   ```

2. Create `server/.env` from `server/.env.example` and set `FINZ_MONGODB_URI` and `CLIENT_URL=http://localhost:5173`.

3. Start the API in one terminal:

   ```bash
   npm run dev:api
   ```

4. Start the client in a second terminal:

   ```bash
   npm run dev:web
   ```

5. Open `http://localhost:5173`, choose **Import transactions**, and select `server/data/NYC Restaurant Co - Raw Transactions.csv`.

The Vite development server proxies `/api` requests to port 5001. For a preloaded local workspace instead, run `npm run seed --prefix server` after configuring MongoDB. To seed automatically at API startup, set `FINZ_AUTO_SEED=true`.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `FINZ_MONGODB_URI` | Yes | MongoDB connection used by this project |
| `PORT` | No | API port; defaults to 5001 |
| `CLIENT_URL` | No | Allowed browser origin; defaults to permissive local development CORS |
| `GROQ_API_KEY` | No | Optional server-side hosted AI categorization/explanation |
| `GROQ_MODEL` | No | Optional Groq model name |
| `FINZ_SEED_FILE` | No | CSV path override for the seed command |
| `FINZ_AUTO_SEED` | No | Set `true` to import the bundled CSV into an empty database at startup |
| `VITE_API_URL` | No | Client API origin for deployment; blank uses same-origin/proxy requests |

Do not place AI provider keys in client environment variables. Copy `client/.env.example` only when configuring a remote API origin.

## API

All endpoints are mounted under `/api/finz`:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | API and MongoDB connection status |
| GET | `/overview` | Transactions, calculated P&L, variances, review counts |
| GET | `/transactions` | Search/filter/sort/paginate ledger rows |
| GET | `/transactions/:id` | Transaction and classification detail |
| PATCH | `/transactions/:id` | Save a category correction or review status |
| POST | `/imports/preview` | Validate/preview CSV or XLSX/XLS without importing |
| POST | `/imports/:id/confirm` | Persist a previewed batch; deduplicates against MongoDB |
| GET | `/imports` | Recent import batches |
| GET | `/categories` | Chart of accounts and P&L account mapping |
| GET | `/financial/pnl` | Monthly P&L calculations |
| GET | `/financial/variances` | Period deltas, materiality, and drivers |
| GET | `/reviews` | Unresolved review queue |
| POST | `/analyst` | Controlled financial query planner and evidence response |

## Financial and accounting methodology

Amounts are stored with the original bank sign: deposits are positive; payments are negative. Expense totals are presented as positive values by summing absolute outflows assigned to each expense account.

- Net revenue = sales/catering/marketplace receipts − refunds and discounts.
- COGS = food and ingredient purchases + beverage inventory + packaging/disposables.
- Gross profit = net revenue − COGS.
- Payroll = wages + payroll taxes and benefits.
- Operating expenses = classified operating outflows.
- Operating profit = gross profit − payroll − operating expenses.

Gift-card deposits, sales-tax remittances, loan principal, owner distributions, and equipment purchases are excluded from operating P&L and routed to review because the bank description alone is not enough to settle liability, equity, or capitalization treatment. Delivery marketplace commissions are classified as operating fees. These assumptions are visible in the classification reasons and can be corrected by a reviewer; corrections immediately change subsequent calculations.

Monthly periods come from transaction dates in MongoDB. A variance is marked material when both its absolute change is at least $500 and its percentage change is at least 10%. If the previous amount is zero, the percentage is undefined and an absolute change of $500 qualifies. Category drivers are calculated as account-total changes from the same transactions; `profitImpact` reverses the sign for expense accounts so revenue and cost contributions are interpretable.

## Categorization and review

Description rules assign high confidence to recurring and recognizable transaction text. Ambiguous accounting treatments are flagged even when the text match is confident. Unmatched rows enter `Needs Review` with lower confidence. A reviewer can change category and add a reason; the API persists a correction history, preserves the first automatic category, and updates P&L inclusion. The current rules deliberately avoid sending clear transactions to an LLM.

If a user checks the hosted-AI option during import, only unmatched row descriptions, counterparties, and amounts may be sent to Groq for categorization. A result is accepted only when its category belongs to the local chart of accounts; unknown or malformed responses remain in review. This opt-in also requires a server `GROQ_API_KEY`.

## Analyst, evidence, and safety

The analyst maps supported question patterns to a bounded set of operations (monthly revenue, monthly payroll, COGS variance, operating-profit variance, review items, or transactions in a period). It does not accept generated SQL. The API calculates totals and drivers from MongoDB, then returns those verified figures alongside real transaction IDs, dates, descriptions, counterparties, amounts, and categories.

By default, the analyst uses a deterministic query planner and answer templates. If the user explicitly enables hosted explanations and the server has a key, a Groq model receives the question and bounded computed facts/evidence; no full collection or arbitrary SQL is sent. The deterministic financial answer remains the returned numeric answer. Transaction text is passed as quoted structured data and treated as untrusted content. Unsupported questions receive a constrained list of supported topics.

## Tests and build

```bash
npm test
npm run build
```

The tests cover CSV/XLSX parsing, invalid rows, rule categorization, manual correction metadata, review selection, P&L line calculations, evidence IDs, materiality, category drivers, and REST health/catalog/request validation. MongoDB-dependent upload and correction integration paths still need an Atlas/local database for a full interactive verification.

## Deployment

`render.yaml` describes an Express service and static Vite client. Create a MongoDB Atlas database, set `FINZ_MONGODB_URI`, `CLIENT_URL`, and the deployed client’s `VITE_API_URL` to the API origin. Add `GROQ_API_KEY` only if hosted AI is desired. The API uses Helmet, bounded JSON input, a 10 MB upload cap, supported file extensions, CORS configuration, and request throttling. Deployment itself is not performed from this workspace.

## Current limitations

- This is a single-workspace finance prototype; authentication and per-user tenant isolation are not implemented.
- Analyst intents are deliberately bounded and deterministic rather than a general-purpose open chat model. Hosted Groq phrasing/classification is optional and requires user opt-in and a key.
- The P&L treatment is an explainable bank-data approximation; it does not infer accruals, inventory consumption, depreciation, split deposits, or tax/interest treatment not present in the source file.
- The transaction explorer uses server-side pagination/search endpoints; the overview currently returns the small assignment ledger for interactive client-side filtering.
- A running MongoDB and installed dependencies are required for the complete upload/correction workflow. They were not installed or provisioned in this environment.
#   F i n z - a i - f i n a n c i a l - r e i v e w .  
 