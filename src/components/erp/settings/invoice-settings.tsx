import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Printer, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import {
  DEFAULT_INVOICE_CONFIG, mergeInvoiceConfig, type InvoiceConfig,
} from "@/lib/erp/invoice-config";

const SAMPLE_ORDER = {
  id: "00000000-0000-0000-0000-000000000000",
  invoice_no: "INV-0000123",
  created_at: new Date().toISOString(),
  status: "confirmed",
  total: 2450, subtotal: 2200, shipping_fee: 120, discount_amount: 0, advance_amount: 500,
  payment_method: "Cash on Delivery",
  courier_name: "Pathao", tracking_number: "PT123456789",
  shipping_name: "Rakib Hasan", shipping_phone: "01711-223344",
  shipping_address: "House 12, Road 5, Block C, Bashundhara R/A",
  shipping_city: "Dhaka", shipping_district: "Dhaka", shipping_thana: "Vatara",
  shipping_note: "Please call before delivery.",
  customer_note: "Gift wrap please.",
  guest_name: null, guest_phone: null,
} as Record<string, any>;

const SAMPLE_ITEMS = [
  { name: "Premium Cotton T-Shirt", quantity: 2, unit_price: 750, price: 750, variant_label: "Size: L, Color: Black", line_total: 1500, sku: "TS-PRM-001", image: null },
  { name: "Sports Cap", quantity: 1, unit_price: 700, price: 700, variant_label: null, line_total: 700, sku: "CAP-001", image: null },
];

export function InvoiceSettings({ brandIdOverride }: { brandIdOverride?: string | null } = {}) {
  const { activeBrand } = useBrand();
  const brandId = brandIdOverride ?? activeBrand?.id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-config-edit", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_settings").select("config").eq("brand_id", brandId!).maybeSingle();
      if (error) throw error;
      return mergeInvoiceConfig((data?.config as any)?.invoice);
    },
  });

  const [cfg, setCfg] = useState<InvoiceConfig>(DEFAULT_INVOICE_CONFIG);
  useEffect(() => { if (data) setCfg(data); }, [data]);

  const upd = <K extends keyof InvoiceConfig>(k: K, v: InvoiceConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const updNested = (path: string[], v: any) => setCfg((c) => {
    const next = structuredClone(c) as any;
    let cur = next;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    cur[path[path.length - 1]] = v;
    return next;
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      // merge with existing config so other keys (default_courier etc) survive
      const { data: existing } = await supabase.from("erp_settings").select("config").eq("brand_id", brandId).maybeSingle();
      const merged = { ...((existing?.config as object) ?? {}), invoice: cfg };
      const { error } = await supabase
        .from("erp_settings")
        .upsert({ brand_id: brandId, config: merged }, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice settings saved");
      qc.invalidateQueries({ queryKey: ["invoice-config", brandId] });
      qc.invalidateQueries({ queryKey: ["invoice-config-edit", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewKey = useMemo(() => JSON.stringify(cfg), [cfg]);

  if (!brandId) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Select a brand to configure its invoice.</div>;
  }
  if (isLoading) {
    return <div className="rounded-xl border bg-card p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
      {/* ----------------- Form panel ----------------- */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <header className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Invoice — {activeBrand?.name}</h2>
            <p className="text-xs text-muted-foreground">Per-brand invoice design & content</p>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </header>

        <Tabs defaultValue="design" className="p-4">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="meta">Meta</TabsTrigger>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="totals">Totals</TabsTrigger>
            <TabsTrigger value="footer">Footer</TabsTrigger>
          </TabsList>

          {/* DESIGN */}
          <TabsContent value="design" className="space-y-4 mt-4">
            <Row label="Theme">
              <Select value={cfg.theme} onValueChange={(v) => upd("theme", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                <SelectItem value="template">HobbyShop Template (recommended)</SelectItem>
                <SelectItem value="modern">Modern (colored band)</SelectItem>
                  <SelectItem value="classic">Classic (B&W)</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="pos">POS / Thermal</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Paper">
                <Select value={cfg.paper} onValueChange={(v) => upd("paper", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A5">A5</SelectItem>
                    <SelectItem value="80mm">80mm POS</SelectItem>
                    <SelectItem value="58mm">58mm POS</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Orientation">
                <Select value={cfg.orientation} onValueChange={(v) => upd("orientation", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Margin">
                <Select value={cfg.margin} onValueChange={(v) => upd("margin", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="wide">Wide</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Font size">
                <Select value={cfg.font.size} onValueChange={(v) => updNested(["font", "size"], v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sm">Small</SelectItem>
                    <SelectItem value="md">Medium</SelectItem>
                    <SelectItem value="lg">Large</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Font family">
                <Select value={cfg.font.family} onValueChange={(v) => updNested(["font", "family"], v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inter">Inter (Latin)</SelectItem>
                    <SelectItem value="hind-siliguri">Hind Siliguri (বাংলা)</SelectItem>
                    <SelectItem value="roboto">Roboto</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Header layout">
                <Select value={cfg.header.layout} onValueChange={(v) => updNested(["header", "layout"], v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logo-left">Logo left</SelectItem>
                    <SelectItem value="logo-center">Logo center</SelectItem>
                    <SelectItem value="logo-right">Logo right</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
            <Row label={`Logo height (${cfg.header.logoHeight}px)`}>
              <Slider min={32} max={120} step={4} value={[cfg.header.logoHeight]} onValueChange={(v) => updNested(["header", "logoHeight"], v[0])} />
            </Row>
            <Row label="Accent color">
              <div className="flex gap-2 items-center">
                <input type="color" value={cfg.accentColor} onChange={(e) => upd("accentColor", e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                <Input value={cfg.accentColor} onChange={(e) => upd("accentColor", e.target.value)} className="font-mono" />
              </div>
            </Row>
            <Row label="Header tagline">
              <Input value={cfg.header.tagline} onChange={(e) => updNested(["header", "tagline"], e.target.value)} placeholder="Your trusted shop since 2020" />
            </Row>
            <ToggleRow label="Show watermark (PAID / DUE / CANCELLED)" v={cfg.header.showWatermark} on={(v) => updNested(["header", "showWatermark"], v)} />
          </TabsContent>

          {/* BUSINESS */}
          <TabsContent value="business" className="space-y-3 mt-4">
            <Row label="Address"><Textarea rows={2} value={cfg.business.address} onChange={(e) => updNested(["business", "address"], e.target.value)} /></Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Hotline"><Input value={cfg.business.hotline} onChange={(e) => updNested(["business", "hotline"], e.target.value)} /></Row>
              <Row label="WhatsApp"><Input value={cfg.business.whatsapp} onChange={(e) => updNested(["business", "whatsapp"], e.target.value)} /></Row>
              <Row label="Email"><Input value={cfg.business.email} onChange={(e) => updNested(["business", "email"], e.target.value)} /></Row>
              <Row label="Website"><Input value={cfg.business.website} onChange={(e) => updNested(["business", "website"], e.target.value)} /></Row>
              <Row label="Facebook"><Input value={cfg.business.facebook} onChange={(e) => updNested(["business", "facebook"], e.target.value)} /></Row>
              <Row label="Instagram"><Input value={cfg.business.instagram} onChange={(e) => updNested(["business", "instagram"], e.target.value)} /></Row>
              <Row label="BIN / VAT reg"><Input value={cfg.business.bin} onChange={(e) => updNested(["business", "bin"], e.target.value)} /></Row>
              <Row label="Trade license"><Input value={cfg.business.trade_license} onChange={(e) => updNested(["business", "trade_license"], e.target.value)} /></Row>
            </div>
          </TabsContent>

          {/* META */}
          <TabsContent value="meta" className="space-y-3 mt-4">
            <ToggleRow label="Show order date" v={cfg.meta.showDate} on={(v) => updNested(["meta", "showDate"], v)} />
            <ToggleRow label="Show courier" v={cfg.meta.showCourier} on={(v) => updNested(["meta", "showCourier"], v)} />
            <ToggleRow label="Show tracking #" v={cfg.meta.showTracking} on={(v) => updNested(["meta", "showTracking"], v)} />
            <ToggleRow label="Show payment method" v={cfg.meta.showPayment} on={(v) => updNested(["meta", "showPayment"], v)} />
            <div className="rounded-md border p-3 space-y-2 bg-muted/20">
              <ToggleRow label="QR code" v={cfg.meta.qr.enabled} on={(v) => updNested(["meta", "qr", "enabled"], v)} />
              {cfg.meta.qr.enabled && (
                <>
                  <Row label="QR target">
                    <Select value={cfg.meta.qr.target} onValueChange={(v) => updNested(["meta", "qr", "target"], v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tracking">Tracking link</SelectItem>
                        <SelectItem value="phone">Customer phone</SelectItem>
                        <SelectItem value="website">Business website</SelectItem>
                        <SelectItem value="custom">Custom URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                  {cfg.meta.qr.target === "custom" && (
                    <Row label="Custom URL"><Input value={cfg.meta.qr.customUrl} onChange={(e) => updNested(["meta", "qr", "customUrl"], e.target.value)} /></Row>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ITEMS */}
          <TabsContent value="items" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Currency"><Input value={cfg.items.currency} onChange={(e) => updNested(["items", "currency"], e.target.value)} /></Row>
              <Row label="Currency position">
                <Select value={cfg.items.currencyPosition} onValueChange={(v) => updNested(["items", "currencyPosition"], v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">Before (৳ 100)</SelectItem>
                    <SelectItem value="after">After (100 ৳)</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Number format">
                <Select value={cfg.items.numberFormat} onValueChange={(v) => updNested(["items", "numberFormat"], v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bd">BD (1,23,456)</SelectItem>
                    <SelectItem value="intl">Intl (123,456)</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
            <ToggleRow label="Show SKU column" v={cfg.items.showSku} on={(v) => updNested(["items", "showSku"], v)} />
            <ToggleRow label="Show variant" v={cfg.items.showVariant} on={(v) => updNested(["items", "showVariant"], v)} />
            <ToggleRow label="Show product image" v={cfg.items.showImage} on={(v) => updNested(["items", "showImage"], v)} />
            <ToggleRow label="Show per-item discount column" v={cfg.items.showDiscount} on={(v) => updNested(["items", "showDiscount"], v)} />
            <ToggleRow label="Zebra row striping" v={cfg.items.zebra} on={(v) => updNested(["items", "zebra"], v)} />
          </TabsContent>

          {/* TOTALS */}
          <TabsContent value="totals" className="space-y-3 mt-4">
            <ToggleRow label="Show subtotal" v={cfg.totals.showSubtotal} on={(v) => updNested(["totals", "showSubtotal"], v)} />
            <ToggleRow label="Show discount" v={cfg.totals.showDiscount} on={(v) => updNested(["totals", "showDiscount"], v)} />
            <ToggleRow label="Show shipping" v={cfg.totals.showShipping} on={(v) => updNested(["totals", "showShipping"], v)} />
            <ToggleRow label="Show advance paid" v={cfg.totals.showAdvance} on={(v) => updNested(["totals", "showAdvance"], v)} />
            <ToggleRow label="Show amount due" v={cfg.totals.showDue} on={(v) => updNested(["totals", "showDue"], v)} />
            <ToggleRow label="Round-off total" v={cfg.totals.roundOff} on={(v) => updNested(["totals", "roundOff"], v)} />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Row label="VAT / Tax %">
                <Input type="number" min={0} max={100} value={cfg.totals.tax.rate} onChange={(e) => updNested(["totals", "tax", "rate"], Number(e.target.value) || 0)} />
              </Row>
              <Row label="Tax mode">
                <Select value={cfg.totals.tax.inclusive ? "inclusive" : "exclusive"} onValueChange={(v) => updNested(["totals", "tax", "inclusive"], v === "inclusive")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive (add to total)</SelectItem>
                    <SelectItem value="inclusive">Inclusive (already in price)</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
            <Row label="Amount in words">
              <Select value={cfg.totals.amountInWords} onValueChange={(v) => updNested(["totals", "amountInWords"], v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="bn">বাংলা</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </TabsContent>

          {/* FOOTER */}
          <TabsContent value="footer" className="space-y-3 mt-4">
            <Row label="Terms & conditions"><Textarea rows={2} value={cfg.footer.terms} onChange={(e) => updNested(["footer", "terms"], e.target.value)} /></Row>
            <Row label="Return / exchange policy"><Textarea rows={2} value={cfg.footer.returnPolicy} onChange={(e) => updNested(["footer", "returnPolicy"], e.target.value)} /></Row>
            <Row label="Thank-you message"><Input value={cfg.footer.thankYou} onChange={(e) => updNested(["footer", "thankYou"], e.target.value)} /></Row>
            <Row label="Signature label"><Input value={cfg.footer.signatureLabel} onChange={(e) => updNested(["footer", "signatureLabel"], e.target.value)} /></Row>
            <Row label="Signature image URL"><Input value={cfg.footer.signatureUrl} onChange={(e) => updNested(["footer", "signatureUrl"], e.target.value)} placeholder="https://..." /></Row>
          </TabsContent>
        </Tabs>
      </div>

      {/* ----------------- Preview panel ----------------- */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
        <header className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <h2 className="font-bold text-base">Live preview</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print test
          </Button>
        </header>
        <div className="bg-zinc-200 dark:bg-zinc-900 p-4 overflow-auto flex-1 min-h-[600px]">
          <div className="mx-auto bg-white shadow-2xl rounded" style={{ maxWidth: cfg.paper === "80mm" ? 320 : cfg.paper === "58mm" ? 240 : 720 }}>
            <PrintableInvoice key={previewKey} order={SAMPLE_ORDER} items={SAMPLE_ITEMS} configOverride={cfg} visible />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-background">
      <span className="text-sm">{label}</span>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}