export type InvoiceTheme = "template" | "classic" | "modern" | "minimal" | "pos";
export type InvoicePaper = "A4" | "A5" | "80mm" | "58mm";
export type InvoiceMargin = "compact" | "normal" | "wide";
export type HeaderLayout = "logo-left" | "logo-center" | "logo-right";
export type CurrencyPosition = "before" | "after";
export type NumberFormatStyle = "bd" | "intl";
export type AmountInWords = "off" | "en" | "bn";

export type InvoiceConfig = {
  theme: InvoiceTheme;
  paper: InvoicePaper;
  orientation: "portrait" | "landscape";
  margin: InvoiceMargin;
  font: { family: "inter" | "hind-siliguri" | "roboto"; size: "sm" | "md" | "lg" };
  accentColor: string;
  header: {
    layout: HeaderLayout;
    logoHeight: number; // px
    tagline: string;
    showWatermark: boolean;
  };
  business: {
    address: string;
    hotline: string;
    email: string;
    website: string;
    facebook: string;
    instagram: string;
    whatsapp: string;
    bin: string;
    trade_license: string;
  };
  meta: {
    showDate: boolean;
    showDelivery: boolean;
    showCourier: boolean;
    showTracking: boolean;
    showPayment: boolean;
    qr: { enabled: boolean; target: "tracking" | "phone" | "website" | "custom"; customUrl: string };
  };
  items: {
    showSku: boolean;
    showVariant: boolean;
    showImage: boolean;
    showDiscount: boolean;
    zebra: boolean;
    currency: string;
    currencyPosition: CurrencyPosition;
    numberFormat: NumberFormatStyle;
  };
  totals: {
    showSubtotal: boolean;
    showDiscount: boolean;
    showShipping: boolean;
    showAdvance: boolean;
    showDue: boolean;
    tax: { rate: number; inclusive: boolean };
    roundOff: boolean;
    amountInWords: AmountInWords;
  };
  footer: {
    terms: string;
    returnPolicy: string;
    thankYou: string;
    signatureLabel: string;
    signatureUrl: string;
    pageNumbers: boolean;
  };
};

export const DEFAULT_INVOICE_CONFIG: InvoiceConfig = {
  theme: "template",
  paper: "A4",
  orientation: "portrait",
  margin: "normal",
  font: { family: "inter", size: "md" },
  accentColor: "#0f172a",
  header: { layout: "logo-left", logoHeight: 56, tagline: "", showWatermark: true },
  business: { address: "", hotline: "", email: "", website: "", facebook: "", instagram: "", whatsapp: "", bin: "", trade_license: "" },
  meta: {
    showDate: true, showDelivery: true, showCourier: true, showTracking: true, showPayment: true,
    qr: { enabled: false, target: "tracking", customUrl: "" },
  },
  items: {
    showSku: false, showVariant: true, showImage: false, showDiscount: false, zebra: true,
    currency: "৳", currencyPosition: "before", numberFormat: "bd",
  },
  totals: {
    showSubtotal: true, showDiscount: true, showShipping: true, showAdvance: true, showDue: true,
    tax: { rate: 0, inclusive: false }, roundOff: false, amountInWords: "en",
  },
  footer: {
    terms: "All sales are final. Goods once sold are not refundable unless damaged on arrival.",
    returnPolicy: "Return / exchange within 3 days with original packaging.",
    thankYou: "Thank you for shopping with us!",
    signatureLabel: "Authorized Signature",
    signatureUrl: "",
    pageNumbers: false,
  },
};

/** Deep-merge user config over defaults — protects against partial/missing keys. */
export function mergeInvoiceConfig(raw: unknown): InvoiceConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const d = DEFAULT_INVOICE_CONFIG;
  return {
    theme: r.theme ?? d.theme,
    paper: r.paper ?? d.paper,
    orientation: r.orientation ?? d.orientation,
    margin: r.margin ?? d.margin,
    font: { ...d.font, ...(r.font ?? {}) },
    accentColor: r.accentColor ?? d.accentColor,
    header: { ...d.header, ...(r.header ?? {}) },
    business: { ...d.business, ...(r.business ?? {}) },
    meta: {
      ...d.meta, ...(r.meta ?? {}),
      qr: { ...d.meta.qr, ...((r.meta?.qr) ?? {}) },
    },
    items: { ...d.items, ...(r.items ?? {}) },
    totals: {
      ...d.totals, ...(r.totals ?? {}),
      tax: { ...d.totals.tax, ...((r.totals?.tax) ?? {}) },
    },
    footer: { ...d.footer, ...(r.footer ?? {}) },
  };
}

/* ---------------------------- Number formatters --------------------------- */

export function formatNumber(n: number, style: NumberFormatStyle): string {
  if (!isFinite(n)) return "0";
  const locale = style === "bd" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

export function formatMoney(n: number, cfg: InvoiceConfig["items"]): string {
  const num = formatNumber(Number(n) || 0, cfg.numberFormat);
  return cfg.currencyPosition === "before" ? `${cfg.currency} ${num}` : `${num} ${cfg.currency}`;
}

/* ---------------------------- Amount in words ----------------------------- */

const EN_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const EN_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function enTwoDigits(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return EN_TENS[t] + (o ? " " + EN_ONES[o] : "");
}

function enThreeDigits(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(EN_ONES[h] + " Hundred");
  if (r) parts.push(enTwoDigits(r));
  return parts.join(" ");
}

function amountInWordsEn(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "Zero Taka Only";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  const parts: string[] = [];
  if (crore) parts.push(enTwoDigits(crore) + " Crore");
  if (lakh) parts.push(enTwoDigits(lakh) + " Lakh");
  if (thousand) parts.push(enTwoDigits(thousand) + " Thousand");
  if (rest) parts.push(enThreeDigits(rest));
  return parts.join(" ") + " Taka Only";
}

const BN_ONES = ["", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "ঊনিশ"];
const BN_TENS_FULL = ["", "দশ", "বিশ", "ত্রিশ", "চল্লিশ", "পঞ্চাশ", "ষাট", "সত্তর", "আশি", "নব্বই"];

function bnTwoDigits(n: number): string {
  if (n < 20) return BN_ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return BN_TENS_FULL[t] + (o ? " " + BN_ONES[o] : "");
}

function bnThreeDigits(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(BN_ONES[h] + " শত");
  if (r) parts.push(bnTwoDigits(r));
  return parts.join(" ");
}

function amountInWordsBn(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "শূন্য টাকা মাত্র";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  const parts: string[] = [];
  if (crore) parts.push(bnTwoDigits(crore) + " কোটি");
  if (lakh) parts.push(bnTwoDigits(lakh) + " লক্ষ");
  if (thousand) parts.push(bnTwoDigits(thousand) + " হাজার");
  if (rest) parts.push(bnThreeDigits(rest));
  return parts.join(" ") + " টাকা মাত্র";
}

export function amountInWords(n: number, lang: AmountInWords): string {
  if (lang === "off") return "";
  return lang === "bn" ? amountInWordsBn(n) : amountInWordsEn(n);
}

/* ---------------------------- Page CSS helpers ---------------------------- */

export const PAPER_WIDTH: Record<InvoicePaper, string> = {
  A4: "210mm", A5: "148mm", "80mm": "80mm", "58mm": "58mm",
};

export const MARGIN_MAP: Record<InvoiceMargin, string> = {
  compact: "6mm", normal: "12mm", wide: "20mm",
};

export const FONT_FAMILY_MAP: Record<InvoiceConfig["font"]["family"], string> = {
  inter: "Inter, system-ui, sans-serif",
  "hind-siliguri": "'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif",
  roboto: "Roboto, system-ui, sans-serif",
};

export const FONT_SIZE_MAP: Record<InvoiceConfig["font"]["size"], string> = {
  sm: "11px", md: "12.5px", lg: "14px",
};

export function pageCss(cfg: InvoiceConfig): string {
  const isPos = cfg.paper === "80mm" || cfg.paper === "58mm";
  const size = isPos
    ? `${PAPER_WIDTH[cfg.paper]} auto`
    : `${cfg.paper} ${cfg.orientation}`;
  const margin = isPos ? "2mm" : MARGIN_MAP[cfg.margin];
  return `@page { size: ${size}; margin: ${margin}; }`;
}