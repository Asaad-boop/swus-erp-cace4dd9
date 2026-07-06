# Dashboard Redesign — Clean Light SaaS, Compact

**File:** `src/routes/_authenticated/erp.index.tsx` (AdminDashboard + all inline section components)

Data logic / queries kichhu change hobe na. Shudhu presentation layer — surface, spacing, typography, borders, colors — rewrite hobe. StaffDashboard alada, oi ta touch korbo na (jodi bolo, porey).

---

## Design language

**Surface**
- Page bg: pure white `#ffffff` (light) — no gradient, no muted tint
- Card bg: white; border `1px solid hsl(220 13% 91%)` (slate-200 equivalent via token)
- Radius: `rounded-lg` (8px) sob card e — 2xl/xl er jaygay. Linear/Vercel feel
- Shadow: shob card e shadow off. Shudhu hover e `shadow-sm`. Sticky header e nichey ekta hairline border only
- Divider: hairline `border-border/60` everywhere, no thick separators

**Typography**
- Family: Inter (already in stack) — Sora/Manrope inline styles remove
- Heading (H1 greeting): `text-lg font-semibold tracking-tight` — currently 2xl, chhoto korbo
- Section title: `text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground` — small caps eyebrow
- KPI number: `text-2xl font-semibold tabular-nums tracking-tight text-slate-900` (currently 30px, compact korbo)
- Label: `text-[11px] font-medium text-muted-foreground uppercase tracking-wider`
- Body: `text-[13px]` default (currently 14px)

**Color accents (semantic, minimal)**
- Primary action: `#3b82f6` (blue-500) — buttons, links, active state
- Positive: `text-emerald-600` + `bg-emerald-50` chips
- Negative: `text-rose-600` + `bg-rose-50` chips
- Neutral trend: `text-slate-500`
- Icon tiles: remove colored tinted backgrounds. Just plain `text-slate-500` icon inside card, top-right, 14×14. No `bg-indigo-50` etc.

**Density**
- Card padding: `p-4` (currently p-5/p-6) — compact
- Grid gap: `gap-2` for KPI, `gap-3` for larger sections (currently gap-3/6)
- Page section spacing: `space-y-4` (currently space-y-6)
- Page horizontal padding: `px-4 md:px-6`, max width `1600px`

---

## Section-by-section changes

### 1. Header (sticky top bar)
- Height chhoto: `py-3` (currently py-5)
- Eyebrow line remove — direct greeting `Good morning, {name}` in `text-base font-semibold`
- Meta line ekta row e: brand · date · sync status · refresh · date range picker
- Sync pill: plain text `Updated 2m ago` — remove pulse dot animation, keep static green dot
- Refresh button: ghost variant, icon-only on mobile

### 2. KPI strip (10 cards)
- Currently: 5-col boro cards with sparkline bars + icon tile + trend chip. Feels heavy.
- New: `grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-2`
- Card: `p-3 rounded-lg border` — compact
- Layout inside card:
  ```
  LABEL (11px, uppercase, muted)          [icon 14px, muted]
  {big value 22px semibold}
  ↑ 12.4%  vs previous          (trend chip inline, small)
  ```
- Sparkline: remove bars (visual clutter). Trend chip only.
- Remove sub text like "Pathao + Steadfast" — just show number + trend, hover for tooltip
- Hover: `hover:border-slate-300 hover:shadow-sm` — subtle lift, no translate

### 3. Must-have widget rows (Profit, Cash, COD, ROAS, Ad Wallet, Stuck Orders, Courier Perf, Return SKUs)
- Wrapper cards: same clean shell — white, border, `rounded-lg`, `p-4`
- Card header: eyebrow small-caps title + optional action link on right (`View →` blue-500 text)
- Inside content untouched (charts/tables), just re-skinned wrapper
- Grids: `gap-3`

### 4. Trend chart + Today analytics + Hourly comparison
- Chart cards: same clean shell
- Recharts colors normalized: primary blue `#3b82f6`, muted grid `#e2e8f0`, tick `#94a3b8`, tooltip white with border
- Legend: pill chips, subtle
- Remove any gradient area fills — flat lines/soft area with 8% opacity fill only

### 5. New vs Returning + Abandoned Cart
- Same clean shell

### 6. Brand comparison (all-brands mode)
- Table look: white, hairline dividers, tabular-nums, no zebra stripe

### 7. Supporting cards row (Courier / COD Outstanding / Returns / Imports)
- 4-col compact `gap-2`, same shell

### 8. Finance section, Inventory health, LowStock, Marketing, TopProducts/Customers, NeedsAttention, LiveOrdersFeed
- Reskin card wrapper to match. Internal data untouched.

### 9. Footer
- Simple `text-xs text-muted-foreground` centered line

---

## Reusable primitives introduced in file

```tsx
// Compact card shell used across all sections
function DashCard({ title, action, className, children }: {...}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
            {title}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// Compact trend chip
function TrendChip({ value }: { value?: number }) {
  if (typeof value !== "number") return null;
  const up = value >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded px-1 py-px text-[11px] font-medium tabular-nums",
      up ? "text-emerald-600" : "text-rose-600"
    )}>
      {up ? <ArrowUpRight className="size-3"/> : <ArrowDownRight className="size-3"/>}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
```

`KpiCard` rewritten — simpler: label row, value, trend chip. No sparkline. No colored icon tile background. Clickable if `to` set.

Existing widget components from `@/components/erp/dashboard/widgets` — I will NOT modify their internals this pass (they have their own Card). If they clash visually, next iteration.

---

## Out of scope (this pass)
- StaffDashboard (`src/components/erp/staff-dashboard.tsx`)
- Widget internals in `src/components/erp/dashboard/widgets.tsx`
- Global theme tokens in `styles.css`
- Dark mode polish (light-first)

## Verification
- Typecheck via `tsgo`
- Screenshot desktop viewport, spot-check header + KPI strip
