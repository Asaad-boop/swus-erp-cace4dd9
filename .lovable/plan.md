# Advanced Invoice System (Per-Brand)

Dui brand er jonno **alada alada invoice config** — settings → invoice tab e shob kichu control kora jabe, live preview shoho. Schema change lagbe na — `erp_settings.config` (jsonb) te shob store korbo.

## Settings Page — Invoice Tab (per active brand)

Ekta notun tab "Invoice" Settings page e. Section gulo:

### 1. Branding & Header
- Logo URL + height slider (40–120px)
- Brand name, tagline / sub-title
- Header layout: `logo-left` / `logo-center` / `logo-right`
- Accent color picker (header band, totals row, badges)
- Show watermark (PAID / DUE / CANCELLED stamp based on payment_status)

### 2. Business Info Block
- Address (multi-line), Hotline, Email, Website
- Social handles (FB / IG / WhatsApp)
- Trade license / BIN / VAT reg no (optional fields)

### 3. Invoice Meta
- Invoice slug/prefix (already ache)
- Show: order date, delivery date, courier, tracking, payment method (toggle each)
- QR code: order tracking link / phone / website (choose target, optional)
- Barcode of invoice no (toggle)

### 4. Items Table
- Column toggles: SKU, Variant, Qty, Unit price, Discount, Total
- Show product image thumbnail (toggle)
- Row zebra striping (toggle)
- Currency symbol + position (৳ before / after)
- Number format: BD comma (1,23,456) vs intl (123,456)

### 5. Totals & Payment
- Show: subtotal, discount, shipping, advance/paid, due (toggle each)
- Tax/VAT: percentage input, inclusive/exclusive toggle
- Round-off toggle
- Amount in words (Bangla / English / off)

### 6. Footer
- Terms & conditions (textarea, multi-line)
- Return policy (textarea)
- Thank-you message
- Signature line: "Authorized signature" + optional signature image URL
- Show page numbers (for multi-page)

### 7. Print / Page Settings
- Paper size: A4 / A5 / 80mm POS / 58mm POS
- Orientation: portrait / landscape
- Margin: compact / normal / wide
- Font family: Inter / Hind Siliguri (Bangla) / Roboto
- Font size: small / medium / large
- Theme: Classic / Modern / Minimal / Colored band

### 8. Live Preview Panel
Right-side e real-time invoice preview — settings change korle shathe shathe update hobe. "Print test invoice" button.

## Invoice Renderer Rebuild

`src/components/erp/orders/order-invoice.tsx` ke rewrite — settings driven:
- Brand er `erp_settings.config.invoice` theke shob value pull
- 4 ta theme component: `ClassicInvoice`, `ModernInvoice`, `MinimalInvoice`, `PosInvoice` (80mm)
- Paper size dynamic `@page` CSS
- QR via `qrcode` lib (already candidate), barcode via `jsbarcode` (optional install)
- Amount-in-words helper (BDT, Bangla + English)

## Data Shape (erp_settings.config.invoice)

```ts
{
  theme: 'classic' | 'modern' | 'minimal' | 'pos',
  paper: 'A4' | 'A5' | '80mm' | '58mm',
  orientation: 'portrait' | 'landscape',
  margin: 'compact' | 'normal' | 'wide',
  font: { family, size },
  accentColor: '#...',
  header: { layout, logoHeight, tagline, showWatermark },
  business: { address, hotline, email, website, social, bin, trade_license },
  meta: { showDate, showDelivery, showCourier, showTracking, showPayment, qr: {enabled,target}, barcode },
  items: { showSku, showVariant, showImage, showDiscount, zebra, currency, currencyPosition, numberFormat },
  totals: { showSubtotal, showDiscount, showShipping, showAdvance, showDue, tax: {rate, inclusive}, roundOff, amountInWords },
  footer: { terms, returnPolicy, thankYou, signatureLabel, signatureUrl, pageNumbers },
}
```

Default config seed kora hobe load er shomoy (kichu na thakle classic A4 default).

## Files

- **New**: `src/lib/erp/invoice-config.ts` (types + defaults + helpers: amount-in-words, currency format)
- **New**: `src/components/erp/settings/invoice-settings.tsx` (the big tabbed form + live preview)
- **New**: `src/components/erp/orders/invoice-themes/{classic,modern,minimal,pos}.tsx`
- **Rewrite**: `src/components/erp/orders/order-invoice.tsx` → reads config, picks theme, injects `@page` CSS
- **Edit**: `src/routes/_authenticated/erp.settings.tsx` → add Tabs (Business | Invoice | Courier maybe later)
- **Edit**: `src/components/erp/settings/business-settings.tsx` → no functional change, just fits inside tab
- Install: `bun add qrcode @types/qrcode` (and optionally `jsbarcode` if barcode toggled on)

## Questions

1. Theme/look er reference ache? (classic black & white safe default, naki modern colored?)
2. POS printer (80mm) lagbe ekhon, naki A4/A5 e enough?
3. Tax/VAT field দরকার ase tomar business e?
4. Amount-in-words Bangla te chai naki English?

Confirm korle implement shuru kori.
