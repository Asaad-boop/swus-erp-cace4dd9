import { useEffect, useState } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import { customerName, customerPhone, invoiceDisplay } from "@/lib/erp/orders";
import { useBrand } from "@/contexts/brand-context";
import { useInvoiceConfig } from "@/hooks/erp/use-invoice-config";
import {
  DEFAULT_INVOICE_CONFIG, FONT_FAMILY_MAP, FONT_SIZE_MAP, amountInWords, formatMoney, pageCss,
  type InvoiceConfig,
} from "@/lib/erp/invoice-config";

type Item = {
  name: string;
  quantity: number;
  unit_price: number | null;
  price: number;
  variant_label: string | null;
  line_total: number | null;
  sku?: string | null;
  image?: string | null;
};

export function PrintableInvoice({
  order,
  items,
  configOverride,
  visible,
}: {
  order: Record<string, any>;
  items: Item[];
  configOverride?: InvoiceConfig;
  visible?: boolean; // when true, render visibly (for live preview)
}) {
  const { activeBrand } = useBrand();
  const { data: cfgData } = useInvoiceConfig(activeBrand?.id);
  const cfg: InvoiceConfig = configOverride ?? cfgData ?? DEFAULT_INVOICE_CONFIG;

  const isPos = cfg.paper === "80mm" || cfg.paper === "58mm";
  const themeKey = isPos ? "pos" : cfg.theme;

  // QR
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  useEffect(() => {
    if (!cfg.meta.qr.enabled) { setQrDataUrl(""); return; }
    const target = cfg.meta.qr.target;
    let value = "";
    if (target === "tracking" && order.tracking_number) {
      value = `https://google.com/search?q=${encodeURIComponent(String(order.tracking_number))}`;
    } else if (target === "phone") value = `tel:${customerPhone(order as any)}`;
    else if (target === "website") value = cfg.business.website || "";
    else value = cfg.meta.qr.customUrl || "";
    if (!value) { setQrDataUrl(""); return; }
    QRCode.toDataURL(value, { width: 120, margin: 0 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [cfg, order]);

  const wrapperBase = visible
    ? "bg-white text-black"
    : "hidden print:block bg-white text-black";

  const fontFamily = FONT_FAMILY_MAP[cfg.font.family];
  const fontSize = FONT_SIZE_MAP[cfg.font.size];

  const styleVars: React.CSSProperties = {
    fontFamily,
    fontSize,
    ["--invoice-accent" as any]: cfg.accentColor,
  };

  const containerStyle: React.CSSProperties = visible
    ? { ...styleVars, width: isPos ? "80mm" : "100%", margin: "0 auto", padding: isPos ? 8 : 24 }
    : { ...styleVars, padding: isPos ? 8 : 24 };

  const wmText =
    String(order.status).toLowerCase() === "cancelled" ? "CANCELLED"
      : Number(order.advance_amount || 0) >= Number(order.total || 0) ? "PAID"
      : Number(order.advance_amount || 0) > 0 ? "PARTIAL"
      : "DUE";

  const ThemeBody =
    themeKey === "pos" ? PosInvoice
    : themeKey === "minimal" ? MinimalInvoice
    : themeKey === "classic" ? ClassicInvoice
    : ModernInvoice;

  return (
    <div id="print-invoice" className={wrapperBase}>
      <style>{`@media print { ${pageCss(cfg)} body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div style={containerStyle} className="relative">
        {cfg.header.showWatermark && !isPos && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ transform: "rotate(-22deg)", opacity: 0.07, fontSize: 120, fontWeight: 900, color: cfg.accentColor }}
          >
            {wmText}
          </div>
        )}
        <ThemeBody order={order} items={items} cfg={cfg} brandName={activeBrand?.name ?? "Invoice"} brandLogo={activeBrand?.logo_url ?? null} qrDataUrl={qrDataUrl} />
      </div>
    </div>
  );
}

/* ============================== Shared bits ============================== */

type ThemeProps = {
  order: Record<string, any>;
  items: Item[];
  cfg: InvoiceConfig;
  brandName: string;
  brandLogo: string | null;
  qrDataUrl: string;
};

function computeTotals(order: Record<string, any>, cfg: InvoiceConfig) {
  const subtotal = Number(order.subtotal || 0);
  const shipping = Number(order.shipping_fee || 0);
  const discount = Number(order.discount_amount || 0);
  const advance = Number(order.advance_amount || 0);
  const taxRate = Number(cfg.totals.tax.rate || 0);
  const taxable = subtotal - discount;
  const tax = cfg.totals.tax.inclusive
    ? (taxable * taxRate) / (100 + taxRate)
    : (taxable * taxRate) / 100;
  const rawTotal = cfg.totals.tax.inclusive
    ? subtotal - discount + shipping
    : subtotal - discount + shipping + tax;
  const total = cfg.totals.roundOff ? Math.round(rawTotal) : rawTotal;
  const due = Math.max(0, total - advance);
  return { subtotal, shipping, discount, advance, tax, total, due };
}

function HeaderBlock({ cfg, brandName, brandLogo }: { cfg: InvoiceConfig; brandName: string; brandLogo: string | null }) {
  const align = cfg.header.layout === "logo-center" ? "items-center text-center"
    : cfg.header.layout === "logo-right" ? "items-end text-right"
    : "items-start text-left";
  return (
    <div className={`flex flex-col ${align} gap-1`}>
      {brandLogo
        ? <img src={brandLogo} alt={brandName} style={{ height: cfg.header.logoHeight, objectFit: "contain" }} />
        : <h1 className="font-extrabold tracking-tight" style={{ fontSize: 22, color: cfg.accentColor }}>{brandName}</h1>}
      {cfg.header.tagline && <p className="text-[11px] text-gray-600">{cfg.header.tagline}</p>}
      <div className="text-[10px] text-gray-600 leading-tight">
        {cfg.business.address && <div>{cfg.business.address}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {cfg.business.hotline && <span>📞 {cfg.business.hotline}</span>}
          {cfg.business.whatsapp && <span>WhatsApp: {cfg.business.whatsapp}</span>}
          {cfg.business.email && <span>✉ {cfg.business.email}</span>}
          {cfg.business.website && <span>🌐 {cfg.business.website}</span>}
        </div>
        {(cfg.business.bin || cfg.business.trade_license) && (
          <div className="flex flex-wrap gap-x-3">
            {cfg.business.bin && <span>BIN: {cfg.business.bin}</span>}
            {cfg.business.trade_license && <span>TL: {cfg.business.trade_license}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaBlock({ order, cfg, qrDataUrl }: { order: Record<string, any>; cfg: InvoiceConfig; qrDataUrl: string }) {
  return (
    <div className="text-right text-[11px] space-y-0.5">
      <div className="font-bold text-base" style={{ color: cfg.accentColor }}>INVOICE</div>
      <div><strong>#</strong> {invoiceDisplay(order as any)}</div>
      {cfg.meta.showDate && <div><strong>Date:</strong> {format(new Date(order.created_at), "dd MMM yyyy")}</div>}
      {cfg.meta.showCourier && order.courier_name && <div><strong>Courier:</strong> {order.courier_name}</div>}
      {cfg.meta.showTracking && order.tracking_number && <div><strong>Tracking:</strong> {order.tracking_number}</div>}
      {cfg.meta.showPayment && order.payment_method && <div><strong>Payment:</strong> {order.payment_method}</div>}
      {qrDataUrl && <img src={qrDataUrl} alt="QR" className="ml-auto mt-1" style={{ width: 70, height: 70 }} />}
    </div>
  );
}

function BillTo({ order }: { order: Record<string, any> }) {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-0.5 text-gray-500 uppercase text-[10px] tracking-wider">Bill To</div>
      <div className="font-semibold text-[13px]">{customerName(order as any)}</div>
      <div>{customerPhone(order as any)}</div>
      <div>{order.shipping_address}</div>
      <div>{[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}</div>
    </div>
  );
}

function ItemsTable({ items, cfg, accentBand }: { items: Item[]; cfg: InvoiceConfig; accentBand: boolean }) {
  const headBg = accentBand ? cfg.accentColor : "transparent";
  const headColor = accentBand ? "#fff" : "inherit";
  return (
    <table className="w-full border-collapse" style={{ marginTop: 12 }}>
      <thead>
        <tr style={{ background: headBg, color: headColor, borderBottom: `2px solid ${cfg.accentColor}` }}>
          <th className="text-left py-1.5 px-2 text-[11px]">#</th>
          <th className="text-left py-1.5 px-2 text-[11px]">Item</th>
          {cfg.items.showSku && <th className="text-left py-1.5 px-2 text-[11px]">SKU</th>}
          <th className="text-center py-1.5 px-2 text-[11px]">Qty</th>
          <th className="text-right py-1.5 px-2 text-[11px]">Price</th>
          {cfg.items.showDiscount && <th className="text-right py-1.5 px-2 text-[11px]">Disc</th>}
          <th className="text-right py-1.5 px-2 text-[11px]">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const lt = Number(it.line_total ?? (it.price * it.quantity));
          const up = Number(it.unit_price ?? it.price);
          return (
            <tr key={i} style={{ background: cfg.items.zebra && i % 2 ? "rgba(0,0,0,0.025)" : "transparent", borderBottom: "1px solid #e5e7eb" }}>
              <td className="py-1.5 px-2 text-[11px] align-top">{i + 1}</td>
              <td className="py-1.5 px-2 text-[11px] align-top">
                <div className="flex items-start gap-2">
                  {cfg.items.showImage && it.image && <img src={it.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 3 }} />}
                  <div>
                    <div className="font-medium">{it.name}</div>
                    {cfg.items.showVariant && it.variant_label && <div className="text-[10px] text-gray-500">{it.variant_label}</div>}
                  </div>
                </div>
              </td>
              {cfg.items.showSku && <td className="py-1.5 px-2 text-[10px] font-mono align-top">{it.sku ?? "—"}</td>}
              <td className="py-1.5 px-2 text-[11px] text-center align-top">{it.quantity}</td>
              <td className="py-1.5 px-2 text-[11px] text-right align-top">{formatMoney(up, cfg.items)}</td>
              {cfg.items.showDiscount && <td className="py-1.5 px-2 text-[11px] text-right align-top">—</td>}
              <td className="py-1.5 px-2 text-[11px] text-right align-top font-medium">{formatMoney(lt, cfg.items)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TotalsBlock({ order, cfg }: { order: Record<string, any>; cfg: InvoiceConfig }) {
  const t = computeTotals(order, cfg);
  const row = (label: string, value: string, strong = false) => (
    <tr>
      <td className="py-0.5 pr-3 text-[11px]" style={{ fontWeight: strong ? 700 : 400 }}>{label}</td>
      <td className="py-0.5 text-right text-[11px]" style={{ fontWeight: strong ? 700 : 400 }}>{value}</td>
    </tr>
  );
  return (
    <div className="flex justify-end mt-3">
      <table style={{ minWidth: 260 }}>
        <tbody>
          {cfg.totals.showSubtotal && row("Subtotal", formatMoney(t.subtotal, cfg.items))}
          {cfg.totals.showDiscount && t.discount > 0 && row("Discount", "− " + formatMoney(t.discount, cfg.items))}
          {cfg.totals.tax.rate > 0 && row(`VAT (${cfg.totals.tax.rate}%${cfg.totals.tax.inclusive ? " incl." : ""})`, formatMoney(t.tax, cfg.items))}
          {cfg.totals.showShipping && row("Shipping", formatMoney(t.shipping, cfg.items))}
          <tr style={{ borderTop: `2px solid ${cfg.accentColor}` }}>
            <td className="py-1 pr-3 text-[13px] font-bold" style={{ color: cfg.accentColor }}>Total</td>
            <td className="py-1 text-right text-[13px] font-bold" style={{ color: cfg.accentColor }}>{formatMoney(t.total, cfg.items)}</td>
          </tr>
          {cfg.totals.showAdvance && t.advance > 0 && row("Advance Paid", "− " + formatMoney(t.advance, cfg.items))}
          {cfg.totals.showDue && row("Amount Due", formatMoney(t.due, cfg.items), true)}
        </tbody>
      </table>
    </div>
  );
}

function FooterBlock({ order, cfg }: { order: Record<string, any>; cfg: InvoiceConfig }) {
  const t = computeTotals(order, cfg);
  const inWords = amountInWords(t.total, cfg.totals.amountInWords);
  return (
    <div className="mt-4 space-y-2 text-[10.5px]">
      {inWords && (
        <div className="border-y border-dashed py-1.5">
          <strong>In words: </strong>{inWords}
        </div>
      )}
      {(order.shipping_note || order.customer_note) && (
        <div className="rounded border border-gray-300 p-2 space-y-0.5">
          {order.shipping_note && <div><strong>Shipping Note:</strong> {order.shipping_note}</div>}
          {order.customer_note && <div><strong>Customer Note:</strong> {order.customer_note}</div>}
        </div>
      )}
      {cfg.footer.terms && <div><strong>Terms:</strong> {cfg.footer.terms}</div>}
      {cfg.footer.returnPolicy && <div><strong>Return:</strong> {cfg.footer.returnPolicy}</div>}
      <div className="flex justify-between items-end pt-6">
        <div className="text-[10px] text-gray-500">{cfg.footer.thankYou}</div>
        <div className="text-center">
          {cfg.footer.signatureUrl && <img src={cfg.footer.signatureUrl} alt="signature" style={{ height: 36, marginLeft: "auto" }} />}
          <div className="border-t border-black/70 pt-1 px-4 text-[10px]">{cfg.footer.signatureLabel}</div>
        </div>
      </div>
    </div>
  );
}

/* ================================ Themes ================================= */

function ModernInvoice(p: ThemeProps) {
  return (
    <>
      <div className="rounded-md overflow-hidden" style={{ background: p.cfg.accentColor, color: "#fff", padding: "10px 14px" }}>
        <div className="flex justify-between items-start">
          <div className="text-white">
            {p.brandLogo
              ? <img src={p.brandLogo} alt={p.brandName} style={{ height: p.cfg.header.logoHeight, filter: "brightness(0) invert(1)" }} />
              : <div className="font-extrabold text-xl">{p.brandName}</div>}
            {p.cfg.header.tagline && <div className="text-[11px] opacity-80">{p.cfg.header.tagline}</div>}
          </div>
          <div className="text-right text-[11px]">
            <div className="font-bold text-base">INVOICE</div>
            <div># {invoiceDisplay(p.order as any)}</div>
            {p.cfg.meta.showDate && <div>{format(new Date(p.order.created_at), "dd MMM yyyy")}</div>}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="text-[10px] text-gray-700 leading-tight">
          {p.cfg.business.address && <div>{p.cfg.business.address}</div>}
          {p.cfg.business.hotline && <div>📞 {p.cfg.business.hotline}</div>}
          {p.cfg.business.email && <div>✉ {p.cfg.business.email}</div>}
          {p.cfg.business.website && <div>🌐 {p.cfg.business.website}</div>}
        </div>
        <div className="flex justify-end">
          {p.qrDataUrl && <img src={p.qrDataUrl} alt="QR" style={{ width: 70, height: 70 }} />}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BillTo order={p.order} />
        <div className="text-right text-[11px] space-y-0.5">
          {p.cfg.meta.showCourier && p.order.courier_name && <div><strong>Courier:</strong> {p.order.courier_name}</div>}
          {p.cfg.meta.showTracking && p.order.tracking_number && <div><strong>Tracking:</strong> {p.order.tracking_number}</div>}
          {p.cfg.meta.showPayment && p.order.payment_method && <div><strong>Payment:</strong> {p.order.payment_method}</div>}
        </div>
      </div>
      <ItemsTable items={p.items} cfg={p.cfg} accentBand />
      <TotalsBlock order={p.order} cfg={p.cfg} />
      <FooterBlock order={p.order} cfg={p.cfg} />
    </>
  );
}

function ClassicInvoice(p: ThemeProps) {
  return (
    <>
      <div className="flex justify-between items-start border-b-2 border-black pb-3">
        <HeaderBlock cfg={p.cfg} brandName={p.brandName} brandLogo={p.brandLogo} />
        <MetaBlock order={p.order} cfg={p.cfg} qrDataUrl={p.qrDataUrl} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BillTo order={p.order} />
      </div>
      <ItemsTable items={p.items} cfg={p.cfg} accentBand={false} />
      <TotalsBlock order={p.order} cfg={p.cfg} />
      <FooterBlock order={p.order} cfg={p.cfg} />
    </>
  );
}

function MinimalInvoice(p: ThemeProps) {
  return (
    <>
      <div className="flex justify-between items-baseline">
        <div className="font-bold tracking-tight" style={{ fontSize: 18, color: p.cfg.accentColor }}>{p.brandName}</div>
        <div className="text-[11px]">#{invoiceDisplay(p.order as any)} · {format(new Date(p.order.created_at), "dd MMM yyyy")}</div>
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{p.cfg.business.address}</div>
      <hr className="my-3 border-gray-300" />
      <BillTo order={p.order} />
      <ItemsTable items={p.items} cfg={p.cfg} accentBand={false} />
      <TotalsBlock order={p.order} cfg={p.cfg} />
      <FooterBlock order={p.order} cfg={p.cfg} />
    </>
  );
}

function PosInvoice(p: ThemeProps) {
  const t = computeTotals(p.order, p.cfg);
  return (
    <div className="text-[10px]" style={{ fontFamily: "ui-monospace, monospace" }}>
      <div className="text-center font-bold text-[13px]">{p.brandName}</div>
      {p.cfg.business.address && <div className="text-center text-[9px]">{p.cfg.business.address}</div>}
      {p.cfg.business.hotline && <div className="text-center text-[9px]">{p.cfg.business.hotline}</div>}
      <div className="text-center my-1">━━━━━━━━━━━━━━━━━━━━━━━</div>
      <div>Inv #: {invoiceDisplay(p.order as any)}</div>
      <div>Date: {format(new Date(p.order.created_at), "dd MMM yyyy HH:mm")}</div>
      <div>To: {customerName(p.order as any)} ({customerPhone(p.order as any)})</div>
      <div className="text-center my-1">━━━━━━━━━━━━━━━━━━━━━━━</div>
      {p.items.map((it, i) => (
        <div key={i} className="mb-1">
          <div className="truncate">{it.name}</div>
          <div className="flex justify-between">
            <span>{it.quantity} × {formatMoney(Number(it.unit_price ?? it.price), p.cfg.items)}</span>
            <span>{formatMoney(Number(it.line_total ?? it.price * it.quantity), p.cfg.items)}</span>
          </div>
        </div>
      ))}
      <div className="text-center my-1">━━━━━━━━━━━━━━━━━━━━━━━</div>
      {p.cfg.totals.showSubtotal && <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(t.subtotal, p.cfg.items)}</span></div>}
      {p.cfg.totals.showDiscount && t.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatMoney(t.discount, p.cfg.items)}</span></div>}
      {p.cfg.totals.showShipping && <div className="flex justify-between"><span>Shipping</span><span>{formatMoney(t.shipping, p.cfg.items)}</span></div>}
      <div className="flex justify-between font-bold border-t border-black mt-1 pt-1"><span>TOTAL</span><span>{formatMoney(t.total, p.cfg.items)}</span></div>
      {p.cfg.totals.showAdvance && t.advance > 0 && <div className="flex justify-between"><span>Paid</span><span>{formatMoney(t.advance, p.cfg.items)}</span></div>}
      {p.cfg.totals.showDue && <div className="flex justify-between font-bold"><span>Due</span><span>{formatMoney(t.due, p.cfg.items)}</span></div>}
      <div className="text-center mt-2">{p.cfg.footer.thankYou}</div>
      {p.qrDataUrl && <div className="flex justify-center mt-2"><img src={p.qrDataUrl} alt="QR" style={{ width: 60, height: 60 }} /></div>}
    </div>
  );
}