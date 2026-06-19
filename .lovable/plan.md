# Finance Module Upgrade — 5 Features

Scope boro, tai phase-by-phase deliver korbo. Sob additive — purono kichui change hobe na.

## Phase 1 — Aged Payables & Receivables Export (Feature 5)

Sobcheye chhoto, instant value.

**New server fns** (`src/lib/erp/finance-overview.functions.ts` e add):

- `exportAgedReceivables({ brandId, asOfDate })` — customer aging buckets (Current / 1-30 / 31-60 / 61-90 / 90+)
- `exportAgedPayables({ brandId, asOfDate })` — supplier aging buckets

**UI**:

- `erp.finance.receivables.tsx` e "Export" dropdown button → Excel + PDF
- `erp.finance.payables.tsx` e same
- Excel: existing `exportToXlsx` from `src/lib/erp/hr/excel.ts`
- PDF: hidden iframe print pattern (payslip-print.tsx pattern)

## Phase 2 — KPI Drill-down (Feature 1)

**New component**: `src/components/erp/finance/finance-drilldown-sheet.tsx`

- Shadcn `Sheet` (slide-over), props: `{ title, dateFrom, dateTo, accountIds?, transactionType?, open, onOpenChange }`
- Inside: 25-per-page transaction list from `erp_journal_lines` + `erp_journal_entries` join
- CSV export button, "View All" link to journal page with prefilled filters

**New server fn**: `getDrilldownTransactions({ brandId, dateFrom, dateTo, accountIds?, type? })`

**Wire-up** in `erp.finance.index.tsx`: each KPI tile clickable → opens sheet with appropriate filter (Revenue / Expense / Net Profit / Cash / AR / AP / cashflow categories).

## Phase 3 — Cash Flow Statement (Feature 2)

**New server fn**: `getCashflowStatement({ brandId, dateFrom, dateTo })` in `finance-overview.functions.ts`

- Operating: Net Profit + ΔAR + ΔAP + ΔInventory + depreciation
- Investing: fixed asset moves
- Financing: equity + loan accounts
- Returns 3 structured sections + opening/closing cash reconciliation

**UI**: Add "Cash Flow" tab in `erp.finance.reports.tsx` with date range picker, Excel export, print.

## Phase 4 — Comparative P&L (Feature 3)

**New server fn**: `getComparativePL({ brandId, periodA, periodB })` — `Promise.all` parallel runs of existing P&L logic.

**UI**: In reports P&L tab, add toggle [Single | Comparative]. Comparative mode shows: Account | Period A | Period B | Δ৳ | Δ%, color coded. Presets: MoM, QoQ, YoY, Custom. Excel export.

## Phase 5 — Budget vs Actual Variance (Feature 4)

**New server fn**: `getBudgetVsActual({ brandId, period })` — join `erp_budgets` with actuals from `erp_journal_lines`.

**UI**: New "Budget vs Actual" tab in reports page:

- Summary cards (Total Budget / Actual / Variance / % Used progress bar)
- Table with status badges (✅ <80% / ⚠️ 80-100% / 🔴 >100%)
- Horizontal bar chart (recharts — already in project)
- Empty state → link to `/erp/finance/budgets`
- Excel export

## Technical Notes

- Sob server fn `applyBrandScope` use korbe
- Sob fn `requireSupabaseAuth` middleware diye protected
- Date pickers existing shadcn pattern
- Reports tabs purono list e add hobe — replace na

## Delivery Strategy

Ami akta message e Phase 1 + 2 ship korbo (drill-down + aged exports — most independent). Tarpor Phase 3, then 4+5. Eta korle:

- Quality maintain hobe
- Apni section-by-section verify korte parben
- Boro ek-shot edit e bug avoid hobe

Ready? Phase 1 + 2 diye shuru kori?  
Show more

**Go** — Phase 1 + 2 শুরু করো। 🚀