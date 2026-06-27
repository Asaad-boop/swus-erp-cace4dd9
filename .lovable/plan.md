## Cargo Balance Account System — Imports Module

Goal: Cargo partner-wise advance balance + ledger, Finance integration, PO/Bill payment from cargo balance. Ledger-only mutations (no direct balance edit). Existing Imports/Finance flow break হবে না।

---

### 1. Database (single migration)

**Reuse**: `imp_cargo_agents` (already আছে — partner master)। `current_balance`, `total_advance`, `total_deducted` computed view দিয়ে আসবে — direct column না।

**New tables:**

- `imp_cargo_ledger`
  - `id, brand_id, cargo_agent_id, entry_date, entry_type` (enum: `opening`, `advance_deposit`, `bill_deduction`, `po_payment`, `refund`, `adjustment`)
  - `debit_bdt, credit_bdt` (one zero, other positive — signed via type)
  - `ref_type` (`finance_txn` | `cargo_bill` | `imp_po` | `manual`), `ref_id uuid`, `ref_label text`
  - `payment_account_id` (nullable, FK `erp_accounts`)
  - `note text, attachment_url text`
  - `created_by uuid, created_at timestamptz`
  - **No update/delete** — RLS denies; correction = new adjustment entry.
- `imp_cargo_bills`
  - `id, brand_id, cargo_agent_id, bill_number, bill_date, shipment_ref, po_id (nullable)`
  - `weight_kg numeric, shipping_charge, customs_charge, service_charge, local_delivery_charge, other_charge, total_bdt numeric`
  - `payment_source` (`cargo_balance` | `account` | `partial`)
  - `paid_from_balance_bdt, paid_from_account_bdt, payable_bdt` (computed/stored)
  - `payment_account_id` nullable, `note, attachment_url, created_by, created_at, updated_at`

**View** `imp_cargo_balances`:

```sql
SELECT cargo_agent_id, brand_id,
  SUM(credit_bdt) - SUM(debit_bdt) AS current_balance,
  SUM(credit_bdt) FILTER (WHERE entry_type IN ('advance_deposit','opening','refund')) AS total_advance,
  SUM(debit_bdt) FILTER (WHERE entry_type IN ('bill_deduction','po_payment')) AS total_deducted
FROM imp_cargo_ledger GROUP BY cargo_agent_id, brand_id;
```

Convention: **credit = cargo holds our money (advance in)**, **debit = consumed (bill/PO out)**. Positive balance = advance available, negative = payable to cargo.

**RPCs (SECURITY DEFINER, atomic):**

- `cargo_advance_deposit(brand, agent, account_id, amount, date, txn_id, note)` → debits `erp_accounts` via `erp_transactions` insert, inserts ledger credit, returns balance.
- `cargo_bill_create(bill payload, payment_source, account_id)` → inserts bill, posts ledger debit (cargo_balance portion), posts erp_transactions for account portion, returns `{bill_id, deducted_from_balance, paid_from_account, payable}`.
- `cargo_po_payment(po_id, agent_id, amount_from_balance, amount_from_account, account_id)` → ledger debit + optional erp_txn + `imp_payments` row.
- `cargo_manual_adjustment(agent, signed_amount, note)` → admin only via `has_role`.

All RPCs check `auth.uid()`, record `created_by`. Add grants + RLS (authenticated brand-scoped read, RPC-only write).

---

### 2. Server functions (`src/lib/erp/imports/cargo.functions.ts`)

- `listCargoAgentsWithBalance({brandIds})` — joins agents + balance view.
- `getCargoLedger({agentId, from?, to?})` with running balance computed in TS.
- `cargoAdvanceDeposit(payload)` → wraps RPC.
- `listCargoBills({brandIds, agentId?})`, `createCargoBill(payload)` → RPC.
- `cargoManualAdjustment(payload)`.
- `getCargoDashboardSummary({brandIds})` — totals advance, payable, net, top partners.

All `.middleware([requireSupabaseAuth])`.

---

### 3. UI — new routes under `/erp/imports/`

```
erp.imports.cargo.index.tsx        → Cargo Partners list (balance cards, status badge)
erp.imports.cargo.$agentId.tsx     → Partner detail: balance card, ledger table, related POs/bills, advance/adjust buttons
erp.imports.cargo.bills.tsx        → Cargo Bills list + "New Bill" dialog
erp.imports.cargo.payments.tsx     → Advance payments list + "Send Advance" dialog
```

**Components** (`src/components/erp/imports/cargo/`):

- `cargo-balance-card.tsx` — current balance, advance total, deducted total, status badge (Advance Available / Settled / Payable to Cargo).
- `advance-deposit-dialog.tsx` — from account, agent, amount, date, txn id, note, attachment.
- `cargo-bill-dialog.tsx` — full bill form with payment source radio (Cargo Balance / Account / Partial → split inputs), live "After this bill" preview.
- `cargo-ledger-table.tsx` — date/type/ref/account/debit/credit/running balance, attachment link, created by.
- `manual-adjustment-dialog.tsx` — admin only.

Sidebar (`erp-sidebar.tsx`): Imports section এ যোগ — Cargo Partners, Cargo Bills, Cargo Payments।

---

### 4. Import PO integration

`erp.imports.orders.new.tsx` + `erp.imports.orders.$orderId.tsx` payment section এ "Pay from Cargo Balance" option add — split inputs (balance vs account), insufficient-balance warning (similar to finance transaction-form pattern)। Submit → `cargo_po_payment` RPC।

Existing `imp_payments` flow intact থাকবে — শুধু extra source option।

---

### 5. Finance dashboard tile

`erp.finance.index.tsx` এ "Cargo Position" card:

- Total advance available, Total payable, Net position
- Top 5 partners by balance
- Link → `/erp/imports/cargo`

---

### 6. Safety

- Ledger table: no UPDATE/DELETE policy → only INSERT via SECURITY DEFINER RPC।
- `cargo_manual_adjustment` requires `has_role(admin)`।
- Every entry: `created_by = auth.uid()`, `created_at = now()`।
- Balance card-এ "balance" never editable input — always read from view।

---

### Open question

1. **Cargo Bill কি PO-এর সাথে link mandatory?** না কি standalone bill (e.g. monthly consolidated) — দুটোই allow করব। (assume optional link)
2. **Multi-brand cargo agent**: same agent multiple brand serve করে কিনা? Current schema agent brand-scoped — তেমনি রাখবে।

Confirm করলে migration দিয়ে শুরু করব।  
Cargo Balance Account System — Imports Module

Existing Imports এবং Finance flow আগে audit করো। তারপর নিচের Cargo Balance Account system add করো। Existing working flow যেন break না হয়।

Goal হলো: প্রতিটা cargo partner / cargo agent এর জন্য আলাদা advance balance account এবং ledger থাকবে। আমরা অনেক সময় cargo company-কে আগে থেকেই advance টাকা পাঠাই, যেমন ২ লাখ, ৩ লাখ বা যেকোনো amount। পরে যখন shipment bill, customs charge, service charge বা purchase/import related payment হয়, তখন চাইলে সেই cargo balance থেকে টাকা কাটা যাবে। আবার চাইলে bank/cash/bKash/Nagad থেকেও payment করা যাবে। Partial payment-ও support করতে হবে।

Balance কখনো manually edit করা যাবে না। সবসময় ledger entry থেকে balance calculate হবে। Correction করতে হলে manual adjustment ledger entry দিতে হবে।

---

## 1. Core Balance Logic

প্রতিটা cargo agent এর ledger থাকবে।

Convention:

- Credit = cargo এর কাছে আমাদের advance টাকা জমা হলো।
- Debit = cargo balance থেকে bill/PO/payment consume হলো।
- Current Balance = Total Credit - Total Debit

Status logic:

- Positive balance = Advance Available  
মানে cargo এর কাছে আমাদের টাকা আছে।
- Zero balance = Settled  
মানে কারো কাছে কারো টাকা নাই।
- Negative balance = Payable to Cargo  
মানে আমরা cargo-কে টাকা দিতে হবে।

Example:

আমি ABC Cargo কে EBL Bank থেকে 300,000 টাকা পাঠালাম।

Ledger:  
Credit = 300,000  
Balance = 300,000

পরে ABC Cargo এর shipment bill হলো 180,000 টাকা এবং আমি cargo balance থেকে pay করলাম।

Ledger:  
Debit = 180,000  
Remaining Balance = 120,000

আর যদি balance থাকে 100,000 কিন্তু bill হয় 135,000, তাহলে:

Deducted from balance = 100,000  
Payable to cargo = 35,000  
Current balance চাইলে 0 রাখা যাবে, অথবা negative -35,000 দেখানো যাবে। এই project এ negative balance support করতে হবে, যাতে clearly বোঝা যায় cargo আমাদের কাছে টাকা পাবে।

---

## 2. Database Migration

Reuse existing table:

- `imp_cargo_agents`  
Cargo partner master হিসেবে থাকবে।

Cargo agent table-এ direct balance column add করা যাবে না। Balance computed view থেকে আসবে।

Create new table: `imp_cargo_ledger`

Fields:

- id
- brand_id
- cargo_agent_id
- entry_date
- entry_type  
Values: opening, advance_deposit, bill_deduction, po_payment, refund, adjustment
- debit_bdt
- credit_bdt
- ref_type  
Values: finance_txn, cargo_bill, imp_po, manual
- ref_id
- ref_label
- payment_account_id nullable, FK to `erp_accounts`
- note
- attachment_url
- created_by
- created_at

Important constraints:

- debit_bdt and credit_bdt must be non-negative.
- One ledger entry can have either debit or credit, not both.
- At least one of debit_bdt or credit_bdt must be greater than 0.
- No update/delete allowed for normal users.
- Old ledger entries must never be deleted.
- Correction must be done by creating a new adjustment entry.

Create new table: `imp_cargo_bills`

Fields:

- id
- brand_id
- cargo_agent_id
- bill_number
- bill_date
- shipment_ref
- po_id nullable
- weight_kg
- shipping_charge
- customs_charge
- service_charge
- local_delivery_charge
- other_charge
- total_bdt
- payment_source  
Values: cargo_balance, account, partial
- paid_from_balance_bdt
- paid_from_account_bdt
- payable_bdt
- payment_account_id nullable
- note
- attachment_url
- created_by
- created_at
- updated_at

Cargo bill PO-এর সাথে mandatory link না। Standalone cargo bill allow করতে হবে, কারণ অনেক সময় monthly consolidated bill বা shipment-based bill হয়।

Create view: `imp_cargo_balances`

This view will calculate cargo-wise balance from ledger.

Logic:

Current balance = total credit - total debit  
Total advance = credit entries from opening, advance_deposit, refund  
Total deducted = debit entries from bill_deduction, po_payment

Use COALESCE so empty ledger হলে null না আসে, 0 আসে।

---

## 3. RPC Functions

সব write action RPC দিয়ে হবে। Direct table insert/update UI থেকে করা যাবে না।

All RPC must be SECURITY DEFINER, atomic, and must check auth.uid().

Required RPCs:

### `cargo_advance_deposit`

Use case: আমি bank/cash/bKash/Nagad থেকে cargo-কে advance টাকা পাঠাব।

Input:

- brand_id
- cargo_agent_id
- payment_account_id
- amount
- payment_date
- transaction_id / reference
- note
- attachment_url

System action:

- Selected payment account থেকে amount reduce করবে।
- Finance transaction history তে money-out / transfer-to-cargo transaction create করবে।
- Cargo ledger এ advance_deposit entry create করবে।
- Ledger credit_bdt = amount হবে।
- Return updated cargo balance.

Important: এখানে wording clear রাখতে হবে — bank/cash account থেকে টাকা বের হচ্ছে, তাই account balance reduce হবে। Cargo ledger-এ credit হবে কারণ cargo এর কাছে আমাদের advance জমা হচ্ছে।

### `cargo_bill_create`

Use case: shipment/cargo bill create এবং payment handle করা।

Input:

- bill payload
- payment_source
- amount_from_balance
- amount_from_account
- payment_account_id
- note
- attachment

System action:

- Cargo bill create করবে।
- If payment source is cargo_balance, ledger debit create করবে।
- If payment source is account, finance transaction create করবে।
- If payment source is partial, দুটোই করবে।
- If bill total payment থেকে বেশি হয়, remaining amount payable_bdt হিসেবে থাকবে।
- Return bill_id, deducted_from_balance, paid_from_account, payable_bdt, updated_balance.

### `cargo_po_payment`

Use case: Import Purchase Order payment cargo balance থেকে অথবা partial ভাবে করা।

Input:

- po_id
- cargo_agent_id
- amount_from_balance
- amount_from_account
- payment_account_id
- note

System action:

- Cargo balance portion থাকলে cargo ledger debit create করবে।
- Account portion থাকলে finance transaction create করবে।
- Existing `imp_payments` flow intact রেখে payment row create করবে।
- Payment source clearly mark করবে: cargo_balance / account / partial.

### `cargo_manual_adjustment`

Use case: ভুল correction বা opening setup।

Input:

- cargo_agent_id
- signed_amount
- note
- attachment_url

Rules:

- Admin only.
- Positive signed amount হলে credit adjustment।
- Negative signed amount হলে debit adjustment।
- Must create ledger entry.
- No direct balance edit.

---

## 4. Server Functions

Create file:

`src/lib/erp/imports/cargo.functions.ts`

Functions:

- `listCargoAgentsWithBalance({ brandIds })`
- `getCargoLedger({ agentId, from?, to? })`
- `cargoAdvanceDeposit(payload)`
- `listCargoBills({ brandIds, agentId? })`
- `createCargoBill(payload)`
- `cargoManualAdjustment(payload)`
- `getCargoDashboardSummary({ brandIds })`

All functions must use:

`.middleware([requireSupabaseAuth])`

Running balance ledger table এ দেখানোর জন্য TS side এ compute করা যাবে, অথবা SQL window function use করা যাবে। যেটা existing pattern এর সাথে safe হয় সেটা use করো।

---

## 5. UI Routes

Add new routes under:

`/erp/imports/`

Routes:

- `/erp/imports/cargo`  
Cargo Partners list
- `/erp/imports/cargo/$agentId`  
Cargo Partner detail page
- `/erp/imports/cargo/bills`  
Cargo Bills list + New Bill dialog
- `/erp/imports/cargo/payments`  
Advance Payments list + Send Advance dialog

Sidebar update:

Imports section এ add করতে হবে:

- Cargo Partners
- Cargo Bills
- Cargo Payments

---

## 6. UI Components

Create components under:

`src/components/erp/imports/cargo/`

Required components:

### `cargo-balance-card.tsx`

Show:

- Current balance
- Total advance
- Total deducted
- Payable / receivable status
- Status badge

Badge logic:

- Positive balance: Advance Available
- Zero balance: Settled
- Negative balance: Payable to Cargo

### `advance-deposit-dialog.tsx`

Fields:

- From account
- Cargo agent
- Amount
- Date
- Transaction ID
- Note
- Attachment

Submit will call `cargo_advance_deposit`.

### `cargo-bill-dialog.tsx`

Fields:

- Cargo agent
- Bill number
- Bill date
- Shipment reference
- Optional PO link
- Weight kg
- Shipping charge
- Customs charge
- Service charge
- Local delivery charge
- Other charge
- Total amount
- Payment source: Cargo Balance / Account / Partial
- Amount from balance
- Amount from account
- Payment account
- Note
- Attachment

Dialog must show live preview:

- Current cargo balance
- Amount to deduct from balance
- Amount paid from account
- Payable amount
- Balance after this bill

### `cargo-ledger-table.tsx`

Columns:

- Date
- Type
- Reference
- Payment account
- Debit
- Credit
- Running balance
- Attachment
- Created by
- Created at

Ledger table এ edit/delete action থাকবে না।

### `manual-adjustment-dialog.tsx`

Admin only.

---

## 7. Import PO Integration

Update these pages:

- `erp.imports.orders.new.tsx`
- `erp.imports.orders.$orderId.tsx`

Payment section এ new payment option add করতে হবে:

- Pay from Cargo Balance
- Pay from Account
- Partial Payment

When user selects cargo balance:

- Cargo agent select করতে হবে।
- Available cargo balance show করতে হবে।
- Amount from cargo balance input থাকবে।
- If amount exceeds available balance, warning দেখাবে।
- But negative balance support করলে admin/allowed user চাইলে proceed করতে পারবে কিনা সেটা existing business rule অনুযায়ী রাখবে। Default safe behavior: warning + confirmation.

Submit করলে `cargo_po_payment` RPC call হবে।

Existing `imp_payments` flow break করা যাবে না। শুধু extra payment source হিসেবে cargo balance add হবে।

---

## 8. Finance Integration

Finance dashboard এ new card add করো:

### Cargo Position

Show:

- Total advance available with cargo
- Total payable to cargo
- Net cargo position
- Top 5 cargo partners by balance
- Link to `/erp/imports/cargo`

Finance transaction history তেও cargo related transaction identifiable হতে হবে। Example:

- Transfer to Cargo Advance
- Cargo Bill Payment
- Import PO Payment via Cargo Balance
- Partial Cargo Payment

যে account থেকে cargo কে টাকা পাঠানো হবে, সেই account balance reduce হবে এবং transaction history তে reflect হবে।

---

## 9. Safety Rules

Very important:

- Cargo balance direct edit করা যাবে না।
- Balance always ledger/view থেকে calculate হবে।
- Ledger UPDATE/DELETE deny করতে হবে।
- Write only via SECURITY DEFINER RPC.
- Manual adjustment admin only.
- Every entry must have created_by and created_at.
- Every create/update action audit log এ রাখতে হবে।
- Existing Imports/Finance/PO/payment flow break করা যাবে না।
- Migration দেওয়ার আগে existing schema audit করে table/column names match করতে হবে।

---

## 10. Assumptions

- Cargo bill PO-এর সাথে mandatory না। PO link optional থাকবে।
- Current cargo agent schema brand-scoped হলে brand-scoped হিসেবেই রাখবে।
- Same cargo multiple brand serve করলে future এ shared partner mapping add করা যাবে, কিন্তু এখন existing schema অনুযায়ী কাজ করো।

Now start with database migration first, but before writing final code, audit existing Imports and Finance schema so table names, account transaction logic, roles, and RLS match correctly.

&nbsp;

&nbsp;