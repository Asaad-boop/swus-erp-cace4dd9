import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus, Trash2, Search, ArrowLeft, Loader2, Sparkles, Truck, Package,
  Star, MinusCircle, PlusCircle, ImageIcon, Info,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import { usePathaoCities, usePathaoZones, usePathaoAreas } from "@/hooks/erp/use-courier-query";
import { pathaoDetectAddressFn } from "@/lib/erp/pathao.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders/new")({
  head: () => ({ meta: [{ title: "New Order — ERP" }] }),
  component: NewOrderPage,
});

type LineItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  image: string | null;
  sku?: string | null;
  stock?: number | null;
};

type ProductHit = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  stock: number;
  is_featured: boolean;
  sku?: string | null;
};

type DeliveryMethod = "pathao" | "steadfast" | "manual";

function NewOrderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeBrand } = useBrand();

  // ── customer & shipping ───────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [shippingNote, setShippingNote] = useState(
    "🙏 মার্চেন্টের অনুমতি ছাড়া প্রোডাক্ট খোলা সম্পূর্ণ নিষিদ্ধ। খুলে দেখতে চাইলে আগে কল করুন।",
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("pathao");
  const [isPreorder, setIsPreorder] = useState(false);
  const [isCrossSale, setIsCrossSale] = useState(false);

  // ── pathao city/zone/area ─────────────────────────────────────────────
  const [cityId, setCityId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [cityName, setCityName] = useState<string>("");
  const [zoneName, setZoneName] = useState<string>("");
  const [areaName, setAreaName] = useState<string>("");
  const showPathao = deliveryMethod === "pathao";
  const { data: cities = [], isLoading: cityLoading, error: cityError } = usePathaoCities();
  const { data: zones = [] } = usePathaoZones(showPathao ? cityId : null);
  const { data: areas = [] } = usePathaoAreas(showPathao ? zoneId : null);
  const detectFn = useServerFn(pathaoDetectAddressFn);
  const detect = useMutation({
    mutationFn: async () => {
      if (!address.trim()) throw new Error("Address likhun age");
      return detectFn({ data: { address: address.trim(), brandId: activeBrand?.id } });
    },
    onSuccess: (r) => {
      if (r.city) { setCityId(r.city.id); setCityName(r.city.name ?? ""); }
      if (r.zone) { setZoneId(r.zone.id); setZoneName(r.zone.name ?? ""); }
      if (r.area) { setAreaId(r.area.id); setAreaName(r.area.name ?? ""); }
      else setAreaId(null);
      toast.success(r.city ? `Detected: ${r.city.name}${r.zone ? " · " + r.zone.name : ""}` : "Couldn't match");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── items ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<LineItem[]>([]);
  const [skuQuery, setSkuQuery] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const { data: products = [], isFetching: searching } = useQuery({
    queryKey: ["new-order-products", activeBrand?.id, nameQuery, skuQuery, featuredOnly],
    enabled: !!activeBrand,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id,title,price,image,stock,is_featured")
        .eq("brand_id", activeBrand!.id)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(30);
      if (nameQuery.trim()) q = q.ilike("title", `%${nameQuery.trim()}%`);
      if (featuredOnly) q = q.eq("is_featured", true);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as ProductHit[];
      if (skuQuery.trim()) {
        const { data: vs } = await supabase
          .from("product_variants")
          .select("product_id,sku")
          .ilike("sku", `%${skuQuery.trim()}%`)
          .limit(50);
        const ids = new Set((vs ?? []).map((v) => v.product_id));
        rows = rows.filter((p) => ids.has(p.id));
      }
      return rows;
    },
  });

  const addItem = (p: ProductHit) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.product_id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        { product_id: p.id, name: p.title, unit_price: Number(p.price), quantity: 1, image: p.image, stock: p.stock },
      ];
    });
  };
  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // ── totals ────────────────────────────────────────────────────────────
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [advanceSource, setAdvanceSource] = useState("");
  const [advanceNumber, setAdvanceNumber] = useState("");
  const [advanceTxnId, setAdvanceTxnId] = useState("");

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items]);
  const grandTotal = Math.max(0, subtotal + Number(shippingFee || 0) - Number(discount || 0) - Number(advance || 0));
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  // ── submit ────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async () => {
      if (!activeBrand) throw new Error("Brand select korun");
      if (!name.trim() || !phone.trim()) throw new Error("Name & Mobile lagbe");
      if (!address.trim()) throw new Error("Address lagbe");
      if (items.length === 0) throw new Error("At least 1 product add korun");
      if (Number(advance) > 0) {
        if (!advanceSource) throw new Error("Advance source select korun");
        if (!advanceNumber || advanceNumber.length < 4) throw new Error("Advance number (min 4 digit) din");
      }

      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .insert({
          brand_id: activeBrand.id,
          status: "confirmed",
          confirmation_status: "confirmed",
          source: "manual",
          is_guest_order: true,
          guest_name: name,
          guest_phone: phone,
          shipping_name: name,
          shipping_phone: phone,
          shipping_address: address,
          shipping_city: cityName || null,
          shipping_thana: zoneName || null,
          shipping_district: areaName || null,
          payment_method: paymentMethod,
          subtotal,
          shipping_fee: Number(shippingFee || 0),
          discount_amount: Number(discount || 0),
          advance_amount: Number(advance || 0),
          advance_source: Number(advance) > 0 ? advanceSource : null,
          advance_payment_number: Number(advance) > 0 ? advanceNumber : null,
          advance_txn_id: Number(advance) > 0 && advanceTxnId ? advanceTxnId : null,
          total: grandTotal,
          shipping_note: shippingNote || null,
          is_preorder: isPreorder,
          is_cross_sale: isCrossSale,
          courier_name: deliveryMethod !== "manual" ? deliveryMethod : null,
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;

      const orderId = orderData.id;
      const itemRows = items.map((i) => ({
        order_id: orderId,
        product_id: i.product_id,
        name: i.name,
        image: i.image,
        price: i.unit_price,
        unit_price: i.unit_price,
        quantity: i.quantity,
        line_total: i.unit_price * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) throw itemsErr;
      return orderId;
    },
    onSuccess: (id) => {
      toast.success("Order created");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      navigate({ to: "/erp/orders", search: { open: id } as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/erp/orders" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight md:text-xl">New Order</h1>
              <div className="text-[11px] text-muted-foreground">{activeBrand?.name ?? "—"}</div>
            </div>
          </div>
          <div className="hidden text-xs text-muted-foreground md:flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> Address likhle Filed গুলো auto fill হবে।
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
        {/* Row 1: Mobile | Name | Delivery Method */}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Mobile Number" required>
            <Input
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="Name" required>
            <Input placeholder="Customer Name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Delivery Method">
            <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as DeliveryMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pathao">Pathao</SelectItem>
                <SelectItem value="steadfast">Steadfast</SelectItem>
                <SelectItem value="manual">Manual / Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Row 2: Address | Shipping Note | Extra Options */}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Address" required>
            <Textarea
              placeholder="Enter full address"
              rows={4}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          <Field
            label="Shipping Note"
            hint={`${shippingNote.length}/350`}
          >
            <Textarea
              rows={4}
              maxLength={350}
              value={shippingNote}
              onChange={(e) => setShippingNote(e.target.value)}
            />
          </Field>
          <Field label="Extra Options">
            <Card className="shadow-none">
              <CardContent className="space-y-2 p-3">
                <ToggleRow
                  label="Preorder"
                  checked={isPreorder}
                  onChange={setIsPreorder}
                />
                <ToggleRow
                  label="Cross Sale"
                  checked={isCrossSale}
                  onChange={setIsCrossSale}
                />
              </CardContent>
            </Card>
          </Field>
        </div>

        {/* Pathao detect bar */}
        {showPathao && (
          <div className="rounded-lg border border-emerald-300/50 bg-emerald-50/60 p-3 dark:bg-emerald-950/20">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Address থেকে City / Zone / Area auto detect করুন। ভুল হলে manually select করুন।
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => detect.mutate()}
                disabled={detect.isPending || !address.trim()}
              >
                {detect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Detect
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="City">
                <Select
                  value={cityId ? String(cityId) : ""}
                  onValueChange={(v) => {
                    const c = cities.find((x) => x.city_id === Number(v));
                    setCityId(Number(v));
                    setCityName(c?.city_name ?? "");
                    setZoneId(null); setZoneName(""); setAreaId(null); setAreaName("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={cityLoading ? "Loading…" : cityError ? "Pathao config missing" : "Select a city"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {cities.map((c) => (
                      <SelectItem key={c.city_id} value={String(c.city_id)}>{c.city_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Zone">
                <Select
                  value={zoneId ? String(zoneId) : ""}
                  onValueChange={(v) => {
                    const z = zones.find((x) => x.zone_id === Number(v));
                    setZoneId(Number(v));
                    setZoneName(z?.zone_name ?? "");
                    setAreaId(null); setAreaName("");
                  }}
                  disabled={!cityId}
                >
                  <SelectTrigger><SelectValue placeholder="Select a zone" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {zones.map((z) => (
                      <SelectItem key={z.zone_id} value={String(z.zone_id)}>{z.zone_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Area">
                <Select
                  value={areaId ? String(areaId) : ""}
                  onValueChange={(v) => {
                    const a = areas.find((x) => x.area_id === Number(v));
                    setAreaId(Number(v));
                    setAreaName(a?.area_name ?? "");
                  }}
                  disabled={!zoneId}
                >
                  <SelectTrigger><SelectValue placeholder="Select an area" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {areas.map((a) => (
                      <SelectItem key={a.area_id} value={String(a.area_id)}>{a.area_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {/* Products area */}
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Ordered Products */}
          <Card className="lg:col-span-3">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Package className="h-4 w-4 text-primary" /> Ordered Products
                </h2>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {items.length} item{items.length !== 1 ? "s" : ""} · {totalQty} qty
                </div>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-12 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-rose-600">No Products added.</p>
                  <p className="text-xs text-muted-foreground">ডান পাশ থেকে product add করুন।</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-lg border bg-card p-2 transition-colors hover:bg-muted/40">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {it.image ? (
                          <img src={it.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{it.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          ৳{it.unit_price.toLocaleString()} · stock {it.stock ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => updateItem(idx, { quantity: Math.max(1, it.quantity - 1) })}>
                          <MinusCircle className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number" min={1}
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                          className="h-8 w-14 text-center"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => updateItem(idx, { quantity: it.quantity + 1 })}>
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        type="number" min={0}
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                        className="h-8 w-24"
                      />
                      <div className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                        ৳{(it.unit_price * it.quantity).toLocaleString()}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:text-rose-700"
                        onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Products */}
          <Card className="lg:col-span-2">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Click To Add Products</h2>
                <Button
                  size="icon"
                  variant={featuredOnly ? "default" : "outline"}
                  className="h-8 w-8"
                  onClick={() => setFeaturedOnly((v) => !v)}
                  title="Featured only"
                >
                  <Star className={cn("h-4 w-4", featuredOnly && "fill-current")} />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Code / SKU">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-8 pl-8" placeholder="Type to Search…" value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} />
                  </div>
                </Field>
                <Field label="Name">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-8 pl-8" placeholder="Type to Search…" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} />
                  </div>
                </Field>
              </div>
              <div className="max-h-[440px] divide-y overflow-y-auto rounded-md border">
                {searching && (
                  <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                )}
                {!searching && products.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">No products found</div>
                )}
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addItem(p)}
                    className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {p.image ? (
                        <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="line-clamp-2 text-sm font-medium leading-tight">{p.title}</div>
                        {p.is_featured && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                        <span>Price: <span className="font-semibold text-primary">৳{Number(p.price).toLocaleString()}</span></span>
                        <span className={cn("font-semibold", p.stock <= 0 ? "text-rose-600" : "text-emerald-700")}>
                          Stock: {p.stock}
                        </span>
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Totals row */}
        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-5">
            <Field label="Discount">
              <Input type="number" min={0} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Advance">
              <Input type="number" min={0} value={advance || ""} onChange={(e) => setAdvance(Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Sub Total">
              <Input readOnly value={subtotal} className="bg-muted/40 font-semibold tabular-nums" />
            </Field>
            <Field label="Delivery Charge">
              <Input type="number" min={0} value={shippingFee || ""} onChange={(e) => setShippingFee(Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Grand Total">
              <Input
                readOnly
                value={grandTotal}
                className="border-rose-300 bg-rose-50/60 font-bold tabular-nums text-rose-700 dark:bg-rose-950/30"
              />
            </Field>
          </CardContent>
        </Card>

        {/* Advance details */}
        {Number(advance) > 0 && (
          <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
            <CardContent className="grid gap-3 p-4 md:grid-cols-4">
              <Field label="Payment Method">
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COD">Cash on Delivery</SelectItem>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                    <SelectItem value="Bank">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Advance Source" required>
                <Select value={advanceSource} onValueChange={setAdvanceSource}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {["bKash", "Nagad", "Rocket", "Upay", "Bank", "Card", "Cash", "Other"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payment Number / Last 4" required>
                <Input
                  inputMode="numeric"
                  maxLength={20}
                  value={advanceNumber}
                  onChange={(e) => setAdvanceNumber(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="01712345678 / 5678"
                />
              </Field>
              <Field label="Transaction ID (optional)">
                <Input maxLength={50} value={advanceTxnId} onChange={(e) => setAdvanceTxnId(e.target.value)} placeholder="e.g. 9F7A2BX1Q" />
              </Field>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sticky create bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="hidden text-sm text-muted-foreground md:flex items-center gap-4">
            <span><Truck className="mr-1 inline h-3.5 w-3.5" /> {deliveryMethod}</span>
            <span>Items: <span className="font-semibold text-foreground">{totalQty}</span></span>
            <span>Subtotal: <span className="font-semibold text-foreground">৳{subtotal.toLocaleString()}</span></span>
          </div>
          <Button
            size="lg"
            className="ml-auto h-12 min-w-[260px] bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
            disabled={create.isPending || items.length === 0}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              <>Create Order (৳{grandTotal.toLocaleString()})</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground/80">
          {label}{required && <span className="ml-0.5 text-rose-600">*</span>}
        </Label>
        {hint && <span className="text-[10px] text-muted-foreground tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-2.5 py-1.5">
      <span className="text-xs font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}