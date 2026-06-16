# Cargo Agent Portal — Plan

Cargo agent / supplier-side lokjon der jonno alada ekta panel, jekhane tara shudhu **nijeder assign kora cargo agent record er PO/carton** dekhte parbe ebong shimito kichu kaaj korte parbe. Admin/operations er full ERP er moto noy.

## 1. Scope — ki ki korte parbe

**Read (shudhu nijer agent er data):**
- Dashboard: kotota PO active, total weight in transit, due payment koto
- PO list + detail (nijer agent ke assign kora)
- Carton list per PO (status, weight, qty)
- Payment history (kar kache koto pawna)

**Write (shimito):**
- Notun PO submit kora (importer-side e pending approval status e ashbe)
- Carton add / update on existing PO: barcode, actual weight, qty
- Carton status update: `at_china_warehouse` → `in_transit` → `arrived_bd`
- Carton release request (release korar request pathabe; final approve admin)
- Shipping cost / fx rate update (nijer PO te)

**Korte parbe na:**
- Brand/account/finance/marketing/inventory kichu na
- Onno agent er PO dekha
- Payment receive mark kora (taka peyeche kina — eta importer set korbe)
- PO delete, supplier ER P edit, product cost edit

## 2. Architecture

### Role & linkage
- `app_role` enum e notun value add: **`cargo_agent`**
- `imp_cargo_agents` table e notun column: **`user_id uuid REFERENCES auth.users`** (nullable; ekta agent record ek user er sathe link)
- Ekta user shudhu ekta agent profile er sathe link thakbe (uniqueness)

### Route structure
TanStack file-based routing e alada layout:

```
src/routes/_agent/
  route.tsx              -- gate: must have role 'cargo_agent', loads agent_id
  agent.index.tsx        -- /agent  dashboard
  agent.orders.index.tsx -- /agent/orders  PO list (own only)
  agent.orders.$id.tsx   -- /agent/orders/:id  detail + cartons
  agent.orders.new.tsx   -- /agent/orders/new  submit new PO
  agent.payments.tsx     -- /agent/payments  payment history
  agent.profile.tsx      -- /agent/profile  own contact info edit
```

`_agent` layout sidebar **simple** — shudhu 4-5 ta link, dark/light toggle, logout. Existing ERP sidebar er moto bhari noy.

### Server functions
Notun file `src/lib/erp/imports/agent.functions.ts` — sob function e:
1. `requireSupabaseAuth` middleware
2. `assertCargoAgent(userId)` helper — `has_role(uid, 'cargo_agent')` + `imp_cargo_agents.user_id = uid` theke `agent_id` resolve
3. Sob query e `.eq('cargo_agent_id', agentId)` force kora — kono input theke agent_id neoa hobe na

Functions:
- `getAgentDashboard`
- `listAgentPurchaseOrders`
- `getAgentPurchaseOrder(poId)` — joto PO chayache check korbe agent_id match kore
- `submitAgentPurchaseOrder` — status default `draft` / `pending_review`
- `upsertAgentCarton`
- `updateAgentCartonStatus` — shudhu allowed transitions
- `requestCartonRelease` — flag `release_requested = true`, importer notification

### RLS policies (security backbone)
Server function level guard cara additional RLS — defense in depth:

```sql
-- imp_purchase_orders
CREATE POLICY "Cargo agents see own POs"
ON public.imp_purchase_orders FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent')
  AND cargo_agent_id IN (
    SELECT id FROM imp_cargo_agents WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Cargo agents update own POs limited"
ON public.imp_purchase_orders FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent')
  AND cargo_agent_id IN (SELECT id FROM imp_cargo_agents WHERE user_id = auth.uid())
);
-- column-level restriction (paid_bdt, supplier_id etc.) server fn level handle hobe
```

Same pattern `imp_cartons`, `imp_po_items`, `imp_payments` (SELECT only) e.

### Approval workflow
- Agent PO submit korle status = `pending_review`
- Importer (admin/operations) ekta inbox e dekhe → approve → status `ordered`
- Agent release request korle carton e `release_requested_at` set → importer dashboard e notification badge
- Existing `imp_status_history` table e sob action log

### Login flow
- Same `/auth` page use korbe
- Login successful holey: role check → `cargo_agent` hole `/agent` e redirect; admin/operations holey `/erp` e
- `_authenticated/route.tsx` ar `_agent/route.tsx` — duitar moddhe role-based redirect

## 3. Agent invite / onboarding
Admin side e **ERP → Imports → Cargo Agents** page e notun button:
- "Invite to portal" → email diye Supabase magic link pathabe
- User signup hole trigger `imp_cargo_agents.user_id` link korbe (email match) ebong `user_roles` e `cargo_agent` row insert
- Manual unlink option o thakbe

## 4. Phased build

**Phase 1 — Foundation (must)**
- Migration: enum add, `user_id` column, RLS policies, invite trigger
- `_agent` layout + dashboard skeleton
- Agent functions: dashboard, list POs, view PO

**Phase 2 — Core actions**
- Submit new PO flow (re-use existing product picker, but simplified)
- Carton add/edit + status update
- Release request flow + importer-side approval

**Phase 3 — Polish**
- Payment history view
- Invite flow UI
- Notifications/badges on importer side
- Mobile-friendly tweaks (agent ra phone theke use korbe)

## 5. Technical notes

- Status enum e `pending_review` add lagbe (jodi already na thake)
- Carton status transition matrix server side validate — agent shudhu forward move korte parbe, backward na
- File upload (invoice/receipt photo) carton level e — Supabase Storage bucket `cargo-uploads`, RLS agent-scoped
- Audit: prottek agent action `imp_status_history` te `actor_user_id` shoho log

---

**Confirm korle ami Phase 1 diye shuru korbo.** Specifically jante chai:
1. `cargo_agent` role naam ki rakhbo, naki `supplier_partner`?
2. PO submit korar shomoy agent ki shudhu **items + carton estimate** dibe, naki shipping cost o nije calculate korbe?
3. Release approval ki **per-carton** hobe, naki **per-PO** bulk?
