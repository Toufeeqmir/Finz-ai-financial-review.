const PNL = {
  'Food Sales': 'revenue', 'Beverage Sales': 'revenue', 'Catering Revenue': 'revenue', 'Delivery Revenue': 'revenue', 'Other Revenue': 'revenue', 'Sales Returns & Discounts': 'contraRevenue',
  'Food & Ingredients': 'cogs', 'Beverage Inventory': 'cogs', 'Packaging & Disposables': 'cogs', 'Payroll Wages': 'payroll', 'Payroll Taxes & Benefits': 'payroll',
  'Rent': 'opex', 'Utilities': 'opex', 'Insurance': 'opex', 'Marketing': 'opex', 'Software & Subscriptions': 'opex', 'Repairs & Maintenance': 'opex',
  'Delivery & Payment Fees': 'opex', 'Professional Services': 'opex', 'Office & Admin': 'opex', 'Cleaning & Linen': 'opex', 'Other Operating Expense': 'opex',
};
const CATEGORIES = [...Object.keys(PNL), 'Gift Card Liability', 'Sales Tax Payable', 'Equipment / Capital Purchase', 'Loan Principal', 'Owner Distribution', 'Needs Review'];
const rules = [
  [/gift card/, 'Gift Card Liability', .99, 'Gift card receipts are treated as a liability until redemption evidence is available.', true],
  [/sales tax remittance|sales tax/, 'Sales Tax Payable', .99, 'Sales tax remittance settles a tax liability and is excluded from P&L.', true],
  [/loan principal|loan repayment/, 'Loan Principal', .99, 'Principal repayment reduces a liability; interest is not separately identified.', true],
  [/owner distribution/, 'Owner Distribution', .99, 'Owner distributions are equity movements, not operating expenses.', true],
  [/equipment purchase|new oven/, 'Equipment / Capital Purchase', .96, 'Equipment may be capitalized; the bank record does not establish depreciation treatment.', true],
  [/pos batch deposit.*food sales/, 'Food Sales', .99, 'POS deposit description identifies food sales.', false],
  [/pos batch deposit.*beverage sales/, 'Beverage Sales', .99, 'POS deposit description identifies beverage sales.', false],
  [/catering invoice payment/, 'Catering Revenue', .98, 'Catering invoice payment is classified as restaurant revenue.', false],
  [/delivery marketplace payout/, 'Delivery Revenue', .98, 'Marketplace payout is classified as sales proceeds.', false],
  [/refunds and discounts/, 'Sales Returns & Discounts', .98, 'Refunds and discounts reduce revenue; the source entry is negative.', false],
  [/food inventory purchase|large catering event food purchase/, 'Food & Ingredients', .96, 'Description identifies food or ingredient purchasing.', false],
  [/beverage inventory purchase/, 'Beverage Inventory', .96, 'Description identifies beverage inventory purchasing.', false],
  [/to-go packaging|disposables/, 'Packaging & Disposables', .93, 'Restaurant packaging is grouped with direct service costs.', false],
  [/payroll.*hourly|manager salary|salary payroll/, 'Payroll Wages', .98, 'Description identifies wage or salary payroll.', false],
  [/payroll taxes|benefits/, 'Payroll Taxes & Benefits', .97, 'Description identifies payroll tax or benefit costs.', false],
  [/^rent\b|rent/, 'Rent', .99, 'Recurring rent payment identified by its transaction description.', false],
  [/utilities|electric|gas\/water/, 'Utilities', .97, 'Description identifies utility service.', false], [/insurance/, 'Insurance', .97, 'Description identifies an insurance premium.', false],
  [/marketing|local ads/, 'Marketing', .95, 'Description identifies advertising or marketing.', false], [/software subscription|pos\/software|annual license/, 'Software & Subscriptions', .95, 'Description identifies a software subscription or license.', false],
  [/repairs and maintenance|repair/, 'Repairs & Maintenance', .94, 'Description identifies repairs or maintenance.', false],
  [/delivery platform commission|marketplace deduction/, 'Delivery & Payment Fees', .94, 'Platform commission is treated as a service fee.', false],
  [/accounting|bookkeeping|professional/, 'Professional Services', .94, 'Description identifies accounting or professional services.', false],
  [/office\/admin|supplies/, 'Office & Admin', .89, 'Description identifies office or administrative supplies.', false],
  [/cleaning|linen service/, 'Cleaning & Linen', .94, 'Description identifies cleaning or linen services.', false],
  [/internet and phone/, 'Utilities', .9, 'Internet and phone are grouped with communications utilities.', false],
  [/bank fee|processing fee/, 'Delivery & Payment Fees', .9, 'Description identifies a payment processing fee.', false],
];
function classify(txn) { const text = `${txn.description || ''} ${txn.counterparty || ''}`.toLowerCase(); const rule = rules.find(([regex]) => regex.test(text)); if (!rule) return { category: 'Needs Review', confidence: .35, classificationMethod: 'review', classificationReason: 'No supported restaurant-account rule matched this transaction.', needsReview: true, isPnl: false }; return { category: rule[1], confidence: rule[2], classificationMethod: 'rules', classificationReason: rule[3], needsReview: rule[4], isPnl: Boolean(PNL[rule[1]]) }; }
module.exports = { PNL, CATEGORIES, classify };
