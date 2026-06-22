# Dispatch Module — Plan

Apnar idea ke aro polish kore ekta production-grade dispatch center bananor plan dilam. Approve korle implement korbo.

## Core Concept

Ekta **scan-driven pipeline**. Staff invoice/barcode scan korbe → order automatically next stage e chole jabe. 3 ta stage:

```
PENDING  →  PACKED  →  READY TO SHIP  →  SHIPPED
(confirmed)  (scan #1)   (scan #2)        (scan #3 + auto courier book)
```

Route: `/erp/dispatch` (sidebar e Operations er niche, Courier er por).

## Page Layout

```
┌──────────────────────────────────────────────────────────┐
│ 🚚 Dispatch Center        Today: 142 pkg / ৳1,23,450    │
│ [Mode: PACK | READY | SHIP]  [📷 Camera]  [Manual entry] │
├──────────────────────────────────────────────────────────┤
│ 🔊 Big Scan Box — barcode/invoice no ekhane              │
│    Last scan: ✅ #INV-1042 → PACKED  (beep on success)   │
├────────────┬────────────┬────────────┬───────────────────┤
│ PENDING    │ PACKED     │ READY      │ SHIPPED (today)   │
│ 23 / ৳45k  │ 12 / ৳28k  │ 8 / ৳19k   │ 99 / ৳1.2L        │
│ [list]     │ [list]     │ [list]     │ [list + consign#] │
└────────────┴────────────┴────────────┴───────────────────┘
[Print Batch (Invoice + Picking List)]  [Daily Summary]
```

## Scan Modes (Mode Switcher)

Staff age "mode" select korbe, tarpor jeta scan korbe sheta oi stage e jabe:

- **PACK mode** → PENDING → PACKED
- **READY mode** → PACKED → READY TO SHIP
- **SHIP mode** → READY → SHIPPED + **auto Pathao booking** (consignment ID instantly)

Wrong mode e scan korle red beep + clear error: "Ei order already packed, READY mode select korun".

## Key Features (apnar idea + extra)

1. **Dual scan input**: HID barcode gun (keyboard input auto-focus) + mobile camera scanner (jsQR, browser e cholbe, app lagbe na).
2. **Auto courier booking on SHIP scan**: existing `pathaoBookOrderAutoFn` call hobe, consignment ID + tracking link toast e dekhabe.
3. **Audio feedback**: success/error/ship distinct beep (Web Audio API, no asset).
4. **Realtime pipeline**: Supabase Realtime e `orders` table subscribe — onno staff scan korle column auto update.
5. **Brand-scoped**: current brand er order shudhu dekhabe.
6. **Print Batch**: select korben kon kon order print korben, ekta dialog e —
   - **Invoice batch** (existing PrintableInvoice reuse)
   - **Picking List** (new): SKU + qty + warehouse location grouped — packer ke shahajjo korbe ki ki tulte hobe.
7. **Daily Summary slide-over**: aaj koto pack/ship holo, courier-wise breakdown (Pathao/Steadfast/RedX), COD total, CSV export.
8. **Click-to-advance fallback**: scan na thakle column theke direct button e click kore advance kora jabe (same RPC).
9. **Error handling**: courier book fail → order shipped na, "Retry booking" button stay korbe. Stock not enough warning.
10. **Keyboard shortcuts**: `1/2/3` mode switch, `Esc` clear scan, `P` print batch.

## Technical Design

**Status mapping** (existing `orders.status` enum):
- PENDING column = `status IN ('confirmed','processing')`
- PACKED = `status = 'packed'`
- READY = `status = 'ready_to_ship'`
- SHIPPED (today) = `status = 'shipped' AND updated_at::date = today`

**Reuses (already in codebase)**:
- `transition_order_status` RPC for status change
- `pathaoBookOrderAutoFn` for courier booking
- `PrintableInvoice` component for invoice print
- `useBrand` + `applyBrandScope` for brand filter
- shadcn UI components

**New files**:
- `src/routes/_authenticated/erp.dispatch.tsx` — main page
- `src/components/erp/dispatch/scan-input.tsx` — barcode/manual input with focus mgmt
- `src/components/erp/dispatch/camera-scanner.tsx` — jsQR based QR/barcode camera
- `src/components/erp/dispatch/dispatch-summary.tsx` — slide-over with stats + CSV
- `src/components/erp/dispatch/batch-print-dialog.tsx` — print picker
- `src/components/erp/dispatch/picking-list-print.tsx` — new picking list template
- `src/lib/erp/audio-feedback.ts` — Web Audio beeps

**Modified**:
- `src/components/erp/erp-sidebar.tsx` — add "Dispatch" link under Operations

**New dependency**: `jsqr` (small, pure JS, camera barcode decode)

**No DB migration needed** — existing schema + RPC already supports this.

## Out of Scope (ei iteration e)

- Onno page (orders, courier) er change na
- New courier provider integration (existing Pathao reuse)
- Realtime courier webhook change na
- DB schema change na

## Success Checks

- 3 mode (Pack/Ready/Ship) scan kaaj korche
- Camera scan kaaj korche
- SHIP scan e Pathao auto-book hocche, consignment ID asche
- Print Batch e Invoice + Picking List dui-i ber hocche
- Audio beep success/error e alada
- 3-column pipeline realtime update hocche

Approve korle implement shuru kori?
