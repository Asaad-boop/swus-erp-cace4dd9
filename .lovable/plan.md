## Goal
Cargo agent jokhon PO ke "Arrived in BD" mark korbe — total KG ar **per-KG rate (BDT)** dibe. Eta theke total shipping cost calculate hobe ar **cartons-er upor weight-proportionally split** hoye jabe. Erpor admin/importer payment dibe, agent payment proof dekhe **release confirm** korbe.

---

## Flow (step by step)

1. **Agent → Mark Arrived in BD dialog** (extend kora):
   - Shipping Date
   - Total Weight (KG)
   - **Per-KG Rate (BDT)** ← notun field
   - Confirm korle:
     - PO update: `status='arrived_bd'`, `shipped_at`, `total_weight_kg`, `shipping_rate_per_kg_bdt`, `shipping_total_bdt = total_weight × rate`
     - **Cartons-e split**: jodi cartons-er `weight_kg` thake → proportional; na thakle quantity-proportional; eta o na thakle equal split. Per-carton update: `shipping_charge_bdt`, `total_landed_bdt = supplier_cost + shipping + local_courier`
     - Status `at_china_warehouse` → `in_transit` cartons → `arrived_bd`

2. **Admin/importer side (existing PO detail page)**:
   - Carton list-e dekhabe je agent release request pathiyeche (already ase)
   - Notun button: **"Pay agent & request release"** — admin payment record kore (existing imp_payments + cargo agent ledger debit). Payment-er sathe carton-ids attach kora jabe.

3. **Agent panel → Payments section**:
   - Notun action: prottek payment row-er pashe **"Confirm received"** + **proof upload** (URL/text reference). Confirm korle:
     - Payment row: `agent_confirmed_at`, `agent_proof_url`, `agent_confirmed_by`
     - Sob related cartons-e `released_at = now()`, `status='released'`

---

## DB migration

**`imp_purchase_orders`** — add column:
- `shipping_rate_per_kg_bdt numeric` (per-KG rate agent provided)

**`imp_payments`** — add columns:
- `agent_confirmed_at timestamptz`
- `agent_confirmed_by uuid`
- `agent_proof_url text`
- `agent_proof_note text`

**RLS**: Cargo agent ke `imp_payments` row update korar permission dite hobe (only payments where the PO belongs to that agent, only proof + confirm columns).

---

## Server functions (`agent.functions.ts`)

- **`markPoArrivedBd`** — extend: accept `per_kg_rate_bdt`. Compute `shipping_total_bdt`. In transaction-like sequence:
  1. Fetch cartons for the PO
  2. Compute weight (or qty) totals → per-carton allocation
  3. Update each carton (`shipping_charge_bdt`, `total_landed_bdt`)
  4. Update PO (status, shipping fields, weight, rate)
- **`confirmAgentPayment`** (new) — input: `paymentId`, `proof_url`, `note?`. Verify the payment's PO belongs to this agent. Update payment + set `released_at` on cartons linked to the payment (or all release-requested cartons if no carton_id on payment).

---

## UI changes

- **`_agent.agent.orders.$orderId.tsx`**:
  - Arrived dialog: add Per-KG Rate input, show live preview `Total = KG × rate`
  - Payments table: add **Confirm + Proof** column with dialog (proof URL/text + note). Confirmed payments show ✓ with proof link.
- **`_authenticated/erp.imports.orders.$orderId.tsx`** (importer side): mention je payments-e agent confirmation lagbe (badge "Awaiting agent confirm" / "Confirmed"). Release section-e agent confirm na hole carton "Released" badge na deye "Awaiting agent confirm" dekhabe. (Light-touch only; existing release/payment flows mostly already ase.)

---

## Out of scope (now)
- File upload for proof image → ekhon shudhu URL/text reference. Pore Supabase storage add kora jabe.
- Auto-journal posting on payment (existing system already handle korche).

---

Confirm korle migration + code change ekshathe push korbo.