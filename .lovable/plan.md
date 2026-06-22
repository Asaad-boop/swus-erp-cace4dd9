## Finance Module Restructure: 19 → 10 tabs

Goal: nav declutter, related jinish ekshathe, kintu **zero functionality loss**. Sob existing page survive korbe — kichu top-nav theke sore tab/section hishebe alada page er moddhe dhukbe. Old URLs **redirect** kore dibo, jate kothao link bhange na.

### Final top nav (10 tabs)

```
Overview · Chart of Accounts · Wallets · Journal · AR/AP · 
Budgets · Taxes · Profitability · Reports · Settings
```

### Merge map (kichu bad jachhe na — sob accessible thakbe)

| New page | Tabs/sections inside | Source pages |
|---|---|---|
| **Wallets** | Wallets · Reconciliation | wallets + reconciliation |
| **Journal** | Entries · Recurring · Quick Entry | journal + recurring + simple |
| **AR/AP** | Receivables · Payables · COD Remit | receivables + payables + cod-remittance |
| **Profitability** | Product · Brand | product-profitability + brand-profitability |
| **Settings** | General · FX Rates · Audit Log | settings + fx + audit |

### Implementation steps

1. **Nav update** — `erp.finance.tsx` e NAV array 19 → 10 kori.
2. **Tabbed wrappers** — proti merged page er existing component logic untouched rakhi, shudhu parent route file e shadcn `<Tabs>` diye wrap kori. Internal table/form/data hook kichui bodlabo na.
3. **Redirect old URLs** — purano route file (e.g. `erp.finance.recurring.tsx`) ke redirect e convert kori (`beforeLoad: () => redirect({ to: "/erp/finance/journal", search: { tab: "recurring" } })`). Eta external bookmark/link bhangbe na.
4. **Deep-link support** — tab state URL search param e (`?tab=recurring`) jate direct link share kora jay.
5. **Overview "Quick Links"** — purano label gulai redirect URL e point korbe (auto-correct tab e land korbe).

### Ki bad jabe NA (guaranteed)

- Kono data, form, hook, business logic touch korchhi na
- Sob 18 page er content accessible thakbe
- External bookmark/old link sob redirect e handle hobe
- Profitability merge e "SKU" tab add korar option khola thakbe (jodi shukno marketing module er sku-pnl finance e dorkar lage)

### Files affected

- **Edit**: `src/routes/_authenticated/erp.finance.tsx` (nav)
- **Edit (wrap with tabs)**: wallets, journal, receivables, product-profitability, settings
- **Convert to redirect** (1-liner files): reconciliation, recurring, simple, payables, cod-remittance, brand-profitability, fx, audit
- **No change**: index, accounts, budgets, taxes, reports

### Technical notes

- Shadcn `<Tabs>` + `useSearch`/`useNavigate` diye `?tab=` sync.
- Redirect pattern:
  ```ts
  export const Route = createFileRoute("/_authenticated/erp/finance/recurring")({
    beforeLoad: () => { throw redirect({ to: "/erp/finance/journal", search: { tab: "recurring" } }); },
  });
  ```
- Existing page component gulo `_authenticated/erp/finance/_tabs/` folder e move kore default export rakhle parent wrapper clean thake. (Optional — chaile in-place rakhao jay.)

---

Confirm korle implement kori. Kono specific merge na pochhondo hole bolo (e.g. "Recurring alada thakuk"), shei tab nav e add kore debo.