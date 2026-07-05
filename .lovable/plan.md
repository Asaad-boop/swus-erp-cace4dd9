# Dollar Purchase + Ad Spend — Simple & Accurate Flow

Ekhon jhamela: rate ekek din ekek rokom, ad spend BDT te convert korte gele kon rate use hobe seta unclear, r P/L (FX gain/loss) track hoy na. Nicher flow te tumi shudhu **2 ta simple entry** debe, baki system nije calculate korbe.

## Core Idea — FIFO Wallet per Ad Account

Protita Meta ad account ke ekta **USD wallet** hishebe treat korbo. Wallet e USD ashe "Dollar Purchase" theke, ar bair hoy "Daily Ad Spend" theke. Purchase gulo **FIFO lot** hishebe boshe — je USD age kena, seta age spend hoy. Ei jonno prottek spend er against e ekta **real cost rate** paoa jay, guess kora lage na.

```text
[Bank/bKash]  --BDT-->  [Dollar Purchase]  --USD @rate-->  [Ad Account Wallet (FIFO lots)]
                                                                    |
                                                                    | daily spend (USD)
                                                                    v
                                                            [Meta Ad Spend Expense]
                                                            cost_bdt = Σ(usd_i × lot_rate_i)
```

## Daily Workflow (tomar side)

**1. Din e ekbar — Dollar kinle:**
- "New Dollar Purchase" → Ad Account, Paid From (bank/bKash), USD amount, Rate (৳/$), Fee → Confirm.
- System: bank theke BDT minus, ad wallet e USD plus (notun FIFO lot), Finance e expense/asset entry auto.

**2. Din e ekbar — Meta sync (already ache):**
- Sync insights pull kore prottek adset/ad er USD spend.
- System: FIFO consume kore — jodi lot1 e $50 baki chilo @৳122 r aj $80 spend hoy, tahole $50@122 + $30@ next lot rate. Total BDT cost otomatic.
- Per campaign / SKU P&L e ei **actual cost_bdt** dhoke, market rate na.

**3. Mash sheshe / jekono somoy:**
- Wallet page e dekhbe: current USD balance, average cost rate, unrealized FX (jodi aj rate 125 hoy r tomar avg 122 → paper gain $balance × 3)।
- FX Gain/Loss report: kon month e koto realized gain/loss hoyeche (spend er somoy lot rate vs current market rate).

## What Changes vs Ekhon

| Ekhon | Notun |
|---|---|
| Rate manually guess/average | Auto FIFO — prottek spend er real cost |
| Ad expense BDT confusing | Ad spend ashar somoy exact BDT auto-post |
| FX profit/loss track nai | Realized + Unrealized FX report |
| Purchase entry te onek field | Shudhu: date, ad acct, paid from, USD, rate, fee |

## UI — 3 ta simple screen

1. **Dollar Purchase** (already ache, simplify korbo): boro "USD" + "Rate" + "Fee" field, effective rate live show, Confirm button.
2. **Ad Wallets** (already ache): protita ad account er USD balance, avg cost, last purchase rate, last spend date. Ek click e detail — FIFO lots + ledger.
3. **FX P&L Report** (notun small card): This month realized FX gain/loss, unrealized on hand, avg cost vs today's market rate.

## Accounting Rules (backend, tumi dekhbe na)

- Dollar Purchase Confirm → DR `Meta Ad Wallet (USD asset)` BDT amount, CR `Bank/bKash`, fee CR bank alada line.
- Daily spend consume → DR `Advertising Expense` (cost_bdt from FIFO), CR `Meta Ad Wallet`.
- Month-end revaluation (optional) → unrealized FX gain/loss on wallet balance.

## Technical Notes

- Tables already exist: `meta_dollar_purchases`, `meta_fifo_lots`, `meta_spend_consumptions`, `meta_ad_wallet_ledger`, view `v_meta_ad_wallet_summary`, RPCs `confirm_meta_dollar_purchase` / `cancel_meta_dollar_purchase`. Marketing sync FIFO consume already wired (see `CostSourceBadge` — fifo/fx_fallback/manual).
- Kaj baki: (a) Purchase form ke aro simple kora (big USD/Rate inputs, live "effective rate = (USD×rate + fee)/USD" preview, keyboard shortcut save), (b) FX P&L mini-report card Wallets page e, (c) Marketing rollup e cost_source badge visible kora jate bujho kothay estimate.

## Sign-off Question

Ei flow te aggre? Aggre hole ami: (1) Dollar Purchase form simplify, (2) FX Gain/Loss card add, (3) SKU/Campaign P&L e "actual cost basis" toggle add — ei 3 ta implement kore debo. Kono step change korte chao?
