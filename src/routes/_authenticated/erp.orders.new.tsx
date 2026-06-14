import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Search, ArrowLeft, Loader2, Sparkles, Truck, Package,
  Star, MinusCircle, PlusCircle, ImageIcon, Info, Wand2, History,
  CheckCircle2, XCircle, AlertCircle, MapPin, User2, Receipt, ArrowRight,
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
import { parseCustomerTextFn } from "@/lib/erp/parse-customer.functions";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
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
  const [orderSource, setOrderSource] = useState<string>("");

  // ── brand-defined order sources ───────────────────────────────────────
  const { data: brandSources = [] } = useQuery({
    queryKey: ["brand-order-sources", activeBrand?.id],
    enabled: !!activeBrand?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("settings")
        .eq("id", activeBrand!.id)
        .maybeSingle();
      if (error) throw error;
      const s = (data?.settings ?? {}) as { order_sources?: string[] };
      const list = Array.isArray(s.order_sources) ? s.order_sources.filter(Boolean) : [];
      return list.length > 0
        ? list
        : ["Facebook", "Instagram", "WhatsApp", "Messenger", "Phone Call", "Website", "Walk-in", "Others"];
    },
  });

  // ── AI paste field ────────────────────────────────────────────────────
  const [pasteText, setPasteText] = useState("");
  const parseFn = useServerFn(parseCustomerTextFn);
  const parse = useMutation({
    mutationFn: async () => parseFn({ data: { text: pasteText.trim() } }),
    onSuccess: (r) => {
      let filled = 0;
      if (r.name) { setName(r.name); filled++; }
      if (r.phone) { setPhone(r.phone); filled++; }
      if (r.address) { setAddress(r.address); filled++; }
      if (filled === 0) toast.error("Kichu extract korte parini");
      else toast.success(`AI ne ${filled} field fill koreche`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── debounced phone → customer & courier history ──────────────────────
  const [debouncedPhone, setDebouncedPhone] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      const digits = phone.replace(/\D/g, "");
      setDebouncedPhone(digits.length >= 11 ? digits.slice(-11).replace(/^(?!0)/, "0") : "");
    }, 500);
    return () => clearTimeout(t);
  }, [phone]);

  // Past orders breakdown for this phone in this brand
  const { data: pastOrders } = useQuery({
    queryKey: ["new-order-customer-history", activeBrand?.id, debouncedPhone],
    enabled: !!activeBrand?.id && !!debouncedPhone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total,status,created_at")
        .eq("brand_id", activeBrand!.id)
        .or(`shipping_phone.eq.${debouncedPhone},guest_phone.eq.${debouncedPhone}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data ?? [];
      const delivered = rows.filter((o) => o.status === "delivered").length;
      const cancelled = rows.filter((o) => o.status === "cancelled" || o.status === "fake").length;
      const returned = rows.filter((o) => o.status === "returned").length;
      const spent = rows.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total ?? 0), 0);
      return { total: rows.length, delivered, cancelled, returned, spent, last: rows[0] ?? null };
    },
  });

  // Courier history (Pathao + Steadfast)
  const historyFn = useServerFn(fetchCourierHistoryFn);
  const { data: courier, isFetching: courierFetching } = useQuery({
    queryKey: ["new-order-courier-history", activeBrand?.id, debouncedPhone],
    enabled: !!activeBrand?.id && !!debouncedPhone,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await historyFn({ data: { phones: [debouncedPhone], brandId: activeBrand!.id } });
      return r.results[debouncedPhone] ?? null;
    },
  });

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
          source_platform: orderSource || null,
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50/70 to-slate-50 pb-32 dark:from-background dark:to-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate({ to: "/erp/orders" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight md:text-xl">
                New Order <span className="ml-1 font-normal text-muted-foreground">— নতুন অর্ডার</span>
              </h1>
              <div className="text-[11px] text-muted-foreground">{activeBrand?.name ?? "Select a brand"}</div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground md:flex">
            <Info className="h-3.5 w-3.5 text-sky-500" />
            Address likhle field গুলো auto-fill হবে।
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {/* AI Smart Paste */}
        <Card className="overflow-hidden border-indigo-200/70 shadow-sm dark:border-indigo-900/40">
          <div className="bg-gradient-to-br from-indigo-50/80 via-indigo-50/40 to-fuchsia-50/40 p-4 dark:from-indigo-950/30 dark:via-indigo-950/10 dark:to-fuchsia-950/10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-950/40">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">AI Smart Paste <span className="ml-1 text-xs font-normal text-indigo-600 dark:text-indigo-300">স্মার্ট পেস্ট</span></div>
                  <div className="text-[11px] text-muted-foreground">
                    Messy text (name + mobile + address) paste করুন — auto fill হবে।
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                disabled={parse.isPending || pasteText.trim().length < 5}
                onClick={() => parse.mutate()}
              >
                {parse.isPending
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Parsing…</>
                  : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Parse & Fill</>}
              </Button>
            </div>
            <Textarea
              rows={2}
              placeholder={`e.g. "Rahim Uddin, 01712345678, House 12, Road 5, Dhanmondi, Dhaka"`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="resize-none border-indigo-100 bg-background/80 focus-visible:ring-indigo-500/30 dark:border-indigo-900/40"
            />
          </div>
        </Card>

        {/* Customer history strip */}
        {debouncedPhone && (
          <CustomerHistoryStrip
            phone={debouncedPhone}
            past={pastOrders}
            courier={courier}
            loading={courierFetching}
          />
        )}

        {/* Main grid: Customer + Courier (left)  |  Quick add + Extras (right) */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT: Customer + Courier + Items + Totals */}
          <div className="space-y-6 lg:col-span-8">
            {/* Customer card */}
            <Card className="overflow-hidden shadow-sm">
              <CardContent className="space-y-5 p-5">
                <SectionHeader icon={<User2 className="h-3.5 w-3.5" />} accent="bg-indigo-600" title="Customer Details" sub="গ্রাহকের বিবরণ" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Mobile Number" bn="মোবাইল নম্বর" required>
                    <Input
                      placeholder="01XXXXXXXXX"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-10 bg-muted/30 focus-visible:bg-background"
                    />
                  </Field>
                  <Field label="Customer Name" bn="নাম" required>
                    <Input
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10 bg-muted/30 focus-visible:bg-background"
                    />
                  </Field>
                  <Field label="Full Address" bn="বিস্তারিত ঠিকানা" required className="md:col-span-2">
                    <Textarea
                      placeholder="House, Road, Area, Thana, District…"
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="bg-muted/30 focus-visible:bg-background"
                    />
                  </Field>
                </div>
              </CardContent>

              {/* Pathao auto-detect rail tucked inside the same card */}
              {showPathao && (
                <div className="border-t border-emerald-100 bg-emerald-50/50 px-5 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/15">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Courier Routing
                      </span>
                      <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/70">— ঠিকানা থেকে auto detect</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 border-emerald-200 bg-background text-[11px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-50"
                      onClick={() => detect.mutate()}
                      disabled={detect.isPending || !address.trim()}
                    >
                      {detect.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
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
                        <SelectTrigger className="h-9 border-emerald-200/70 bg-background">
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
                        <SelectTrigger className="h-9 border-emerald-200/70 bg-background"><SelectValue placeholder="Select a zone" /></SelectTrigger>
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
                        <SelectTrigger className="h-9 border-emerald-200/70 bg-background"><SelectValue placeholder="Select an area" /></SelectTrigger>
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
            </Card>

            {/* Ordered Products */}
            <Card className="overflow-hidden shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={<Package className="h-3.5 w-3.5" />} accent="bg-orange-500" title="Ordered Products" sub="অর্ডারকৃত পণ্য" />
                  <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                    {items.length} items · {totalQty} qty
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-muted-foreground/15 bg-muted/20 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-background shadow-sm">
                      <Package className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No products added</p>
                    <p className="text-[11px] text-muted-foreground/80">ডান পাশ থেকে product add করুন</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-3 rounded-xl border bg-background p-2.5 transition-all hover:border-indigo-200 hover:shadow-sm">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-muted">
                          {it.image ? (
                            <img src={it.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{it.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            ৳{it.unit_price.toLocaleString()} · stock {it.stock ?? "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md"
                            onClick={() => updateItem(idx, { quantity: Math.max(1, it.quantity - 1) })}>
                            <MinusCircle className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number" min={1}
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="h-7 w-12 border-0 bg-transparent text-center font-semibold shadow-none focus-visible:ring-0"
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md"
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
                        <div className="w-24 shrink-0 text-right text-sm font-bold tabular-nums">
                          ৳{(it.unit_price * it.quantity).toLocaleString()}
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Totals */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-5">
                <SectionHeader icon={<Receipt className="h-3.5 w-3.5" />} accent="bg-rose-500" title="Financial Summary" sub="হিসাব" />
                <div className="grid gap-3 md:grid-cols-5">
                  <MoneyField label="Discount">
                    <Input type="number" min={0} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="0"
                      className="h-10 border-0 bg-transparent pl-7 text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0" />
                  </MoneyField>
                  <MoneyField label="Advance">
                    <Input type="number" min={0} value={advance || ""} onChange={(e) => setAdvance(Number(e.target.value))} placeholder="0"
                      className="h-10 border-0 bg-transparent pl-7 text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0" />
                  </MoneyField>
                  <MoneyField label="Sub Total" readOnly>
                    <div className="px-3 py-2 text-sm font-bold tabular-nums text-muted-foreground">
                      ৳ {subtotal.toLocaleString()}
                    </div>
                  </MoneyField>
                  <MoneyField label="Delivery">
                    <Input type="number" min={0} value={shippingFee || ""} onChange={(e) => setShippingFee(Number(e.target.value))} placeholder="0"
                      className="h-10 border-0 bg-transparent pl-7 text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0" />
                  </MoneyField>
                  <MoneyField label="Grand Total" tone="danger">
                    <div className="px-3 py-2 text-base font-black tabular-nums text-rose-600">
                      ৳ {grandTotal.toLocaleString()}
                    </div>
                  </MoneyField>
                </div>
              </CardContent>
            </Card>

            {/* Advance details */}
            {Number(advance) > 0 && (
              <Card className="border-amber-300/60 bg-amber-50/40 shadow-sm dark:bg-amber-950/10">
                <CardContent className="space-y-4 p-5">
                  <SectionHeader icon={<Sparkles className="h-3.5 w-3.5" />} accent="bg-amber-500" title="Advance Payment Details" sub="অগ্রিম পেমেন্টের তথ্য" />
                  <div className="grid gap-3 md:grid-cols-4">
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
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: Quick add + Delivery + Extras */}
          <div className="space-y-6 lg:col-span-4">
            {/* Delivery method */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-5">
                <Field label="Order Source" bn="অর্ডার সোর্স">
                  <Select value={orderSource} onValueChange={setOrderSource}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Where did this order come from?" />
                    </SelectTrigger>
                    <SelectContent>
                      {brandSources.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Delivery Method" bn="ডেলিভারি">
                  <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as DeliveryMethod)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pathao">Pathao Courier</SelectItem>
                      <SelectItem value="steadfast">Steadfast</SelectItem>
                      <SelectItem value="manual">Manual / Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Shipping Note" hint={`${shippingNote.length}/350`}>
                  <Textarea
                    rows={4}
                    maxLength={350}
                    value={shippingNote}
                    onChange={(e) => setShippingNote(e.target.value)}
                    className="resize-none bg-muted/30 focus-visible:bg-background"
                  />
                </Field>
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Extra Options</div>
                  <ToggleRow label="Preorder" checked={isPreorder} onChange={setIsPreorder} />
                  <ToggleRow label="Cross Sale" checked={isCrossSale} onChange={setIsCrossSale} />
                </div>
              </CardContent>
            </Card>

            {/* Quick add products */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Quick Add Products</div>
                    <div className="text-[11px] text-muted-foreground">পণ্য যোগ করুন</div>
                  </div>
                  <Button
                    size="icon"
                    variant={featuredOnly ? "default" : "outline"}
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setFeaturedOnly((v) => !v)}
                    title="Featured only"
                  >
                    <Star className={cn("h-4 w-4", featuredOnly && "fill-current")} />
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-9 pl-9" placeholder="Search by Code / SKU" value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} />
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-9 pl-9" placeholder="Search by Name" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} />
                  </div>
                </div>
                <div className="max-h-[520px] space-y-1.5 overflow-y-auto rounded-xl border bg-muted/20 p-2">
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
                      className="group flex w-full items-center gap-3 rounded-lg border border-transparent bg-background p-2 text-left transition-all hover:border-indigo-200 hover:shadow-sm"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        {p.image ? (
                          <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="line-clamp-2 text-[12px] font-semibold leading-tight">{p.title}</div>
                          {p.is_featured && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
                          <span className="font-bold text-primary">৳{Number(p.price).toLocaleString()}</span>
                          <span className={cn("font-semibold", p.stock <= 0 ? "text-rose-600" : "text-emerald-700")}>
                            stock {p.stock}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-md bg-muted p-1 text-muted-foreground transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                        <Plus className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Sleek sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/85 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="hidden items-center gap-6 md:flex">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Truck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Courier</div>
                <div className="text-sm font-semibold capitalize">{deliveryMethod}</div>
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Items</div>
              <div className="text-sm font-bold tabular-nums">{totalQty} pcs</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subtotal</div>
              <div className="text-sm font-bold tabular-nums">৳ {subtotal.toLocaleString()}</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right md:block">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payable</div>
              <div className="text-lg font-black tabular-nums text-indigo-600">৳ {grandTotal.toLocaleString()}</div>
            </div>
            <Button
              size="lg"
              className="group h-12 gap-2 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white shadow-lg shadow-emerald-200/60 hover:bg-emerald-700 dark:shadow-emerald-950/30"
              disabled={create.isPending || items.length === 0}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              ) : (
                <>
                  <span>Create Order</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, required, hint, children, bn, className,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode; bn?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label className="flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>
          {bn && <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">{bn}</span>}
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
    <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2 transition-colors hover:bg-background">
      <span className="text-xs font-semibold">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SectionHeader({
  icon, accent, title, sub,
}: { icon: React.ReactNode; accent: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("inline-block h-4 w-1 rounded-full", accent)} />
      <div className="flex items-center gap-1.5 text-muted-foreground/70">{icon}</div>
      <div className="text-sm font-bold text-foreground">
        {title}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">— {sub}</span>}
      </div>
    </div>
  );
}

function MoneyField({
  label, children, tone, readOnly,
}: { label: string; children: React.ReactNode; tone?: "danger"; readOnly?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(
        "block text-[10px] font-bold uppercase tracking-wider",
        tone === "danger" ? "text-rose-500" : "text-muted-foreground",
      )}>{label}</Label>
      <div className={cn(
        "relative flex items-center rounded-lg border bg-muted/30 transition-colors focus-within:bg-background focus-within:ring-2 focus-within:ring-indigo-500/20",
        tone === "danger" && "border-rose-200 bg-rose-50/60 focus-within:ring-rose-500/20 dark:border-rose-900/40 dark:bg-rose-950/20",
        readOnly && "bg-muted/40",
      )}>
        {!readOnly && (
          <span className={cn(
            "pointer-events-none absolute left-3 text-sm font-semibold",
            tone === "danger" ? "text-rose-400" : "text-muted-foreground/60",
          )}>৳</span>
        )}
        {children}
      </div>
    </div>
  );
}

type PastSummary = {
  total: number; delivered: number; cancelled: number; returned: number; spent: number;
  last: { id: string; created_at: string; total: number; status: string } | null;
} | undefined;

type CourierData = {
  found: boolean;
  summary: { total: number; success: number; cancelled: number };
  providers: { name: string; label: string; ok: boolean; total: number; success: number; cancelled: number }[];
} | null | undefined;

function CustomerHistoryStrip({
  phone, past, courier, loading,
}: { phone: string; past: PastSummary; courier: CourierData; loading: boolean }) {
  const totalCourier = courier?.summary.total ?? 0;
  const successCourier = courier?.summary.success ?? 0;
  const pct = totalCourier > 0 ? Math.round((successCourier / totalCourier) * 100) : null;
  const toneBg =
    pct == null ? "from-slate-500/10 to-slate-500/0 text-slate-600 ring-slate-300/60"
    : pct >= 80 ? "from-emerald-500/15 to-emerald-500/0 text-emerald-700 ring-emerald-300/70 dark:text-emerald-300"
    : pct >= 50 ? "from-amber-500/15 to-amber-500/0 text-amber-700 ring-amber-300/70 dark:text-amber-300"
    : "from-rose-500/15 to-rose-500/0 text-rose-700 ring-rose-300/70 dark:text-rose-300";

  const initials = (phone || "").slice(-2);

  return (
    <Card className="overflow-hidden border-sky-200/60 bg-gradient-to-r from-sky-50/80 via-white to-white shadow-sm dark:from-sky-950/20 dark:via-background dark:to-background">
      <CardContent className="space-y-3 p-3 md:p-4">
        {/* Row 1: customer + inline stats + overall score */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-bold text-white shadow ring-2 ring-white dark:ring-background">
              {initials || <History className="h-4 w-4" />}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer · গ্রাহক</div>
              <div className="truncate text-sm font-bold tabular-nums">{phone || "—"}</div>
            </div>
          </div>

          {/* Inline stats — no individual cards, just clean numbers with dividers */}
          <div className="flex flex-1 items-center gap-x-5 gap-y-2 overflow-x-auto">
            <InlineStat label="Orders" value={past?.total ?? 0} />
            <InlineStat label="Delivered" value={past?.delivered ?? 0} tone="text-emerald-600 dark:text-emerald-400" />
            <InlineStat label="Cancelled" value={past?.cancelled ?? 0} tone="text-rose-600 dark:text-rose-400" />
            <InlineStat label="Returned" value={past?.returned ?? 0} tone="text-amber-600 dark:text-amber-400" />
            <InlineStat label="Spent" value={`৳${(past?.spent ?? 0).toLocaleString()}`} tone="text-indigo-600 dark:text-indigo-400" />
          </div>

          {pct != null && (
            <div className={cn(
              "flex items-center gap-2 rounded-full bg-gradient-to-br px-3 py-1.5 ring-1 ring-inset",
              toneBg,
            )}>
              <div className="relative h-8 w-8">
                <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-current opacity-20" />
                  <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-current" strokeDasharray={`${(pct / 100) * 94.25} 94.25`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums">{pct}</div>
              </div>
              <div className="leading-tight">
                <div className="text-[9px] font-bold uppercase tracking-wider opacity-80">Success rate</div>
                <div className="text-sm font-extrabold">Overall {pct}%</div>
              </div>
            </div>
          )}
        </div>

        {/* Row 2: courier providers — only render if we have data */}
        {(courier?.providers?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 border-t border-dashed border-sky-200/60 pt-3 dark:border-sky-900/40">
            <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <Truck className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Courier</span>
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {(courier?.providers ?? []).map((p) => (
                <CourierProviderChip key={p.name} provider={p} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InlineStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex shrink-0 flex-col leading-tight">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("text-base font-extrabold tabular-nums", tone ?? "text-foreground")}>{value}</span>
    </div>
  );
}

type ProviderRow = { name: string; label: string; ok: boolean; total: number; success: number; cancelled: number };

const PROVIDER_THEME: Record<string, { from: string; to: string; ring: string; chip: string; dot: string }> = {
  pathao:    { from: "from-emerald-500/15", to: "to-emerald-500/0",  ring: "ring-emerald-300/60",  chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  steadfast: { from: "from-violet-500/15",  to: "to-violet-500/0",   ring: "ring-violet-300/60",   chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",     dot: "bg-violet-500" },
  redx:      { from: "from-rose-500/15",    to: "to-rose-500/0",     ring: "ring-rose-300/60",     chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",           dot: "bg-rose-500" },
  paperfly:  { from: "from-sky-500/15",     to: "to-sky-500/0",      ring: "ring-sky-300/60",      chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",              dot: "bg-sky-500" },
  ecourier:  { from: "from-amber-500/15",   to: "to-amber-500/0",    ring: "ring-amber-300/60",    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",        dot: "bg-amber-500" },
};

function CourierProviderCard({ provider }: { provider: ProviderRow }) {
  const key = provider.name.toLowerCase();
  const theme = PROVIDER_THEME[key] ?? { from: "from-slate-500/10", to: "to-slate-500/0", ring: "ring-slate-300/60", chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300", dot: "bg-slate-500" };
  const pct = provider.total > 0 ? Math.round((provider.success / provider.total) * 100) : null;

  const scoreTone =
    pct == null ? "text-muted-foreground"
    : pct >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 50 ? "text-amber-600 dark:text-amber-400"
    : "text-rose-600 dark:text-rose-400";

  const ringStroke =
    pct == null ? "stroke-slate-400"
    : pct >= 80 ? "stroke-emerald-500"
    : pct >= 50 ? "stroke-amber-500"
    : "stroke-rose-500";

  const dash = pct == null ? 0 : (pct / 100) * 87.96; // r=14 circumference

  if (!provider.ok) {
    return (
      <div className={cn("flex w-[112px] flex-col rounded-xl border bg-gradient-to-br p-2 shadow-sm ring-1 ring-inset", theme.from, theme.to, theme.ring)}>
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{provider.label}</span>
        </div>
        <div className="mt-2 flex flex-1 items-center justify-center text-[11px] italic text-muted-foreground">Not connected</div>
      </div>
    );
  }

  return (
    <div className={cn("group relative flex w-[132px] flex-col gap-1.5 overflow-hidden rounded-xl border bg-gradient-to-br p-2 shadow-sm ring-1 ring-inset transition-all hover:-translate-y-0.5 hover:shadow-md", theme.from, theme.to, theme.ring)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/80">{provider.label}</span>
        </div>
        <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
          {provider.total}
        </span>
      </div>

      {/* Gauge + score */}
      <div className="flex items-center gap-2">
        <div className="relative h-10 w-10 shrink-0">
          <svg viewBox="0 0 32 32" className="h-10 w-10 -rotate-90">
            <circle cx="16" cy="16" r="14" fill="none" strokeWidth="3" className="stroke-foreground/10" />
            <circle
              cx="16" cy="16" r="14" fill="none" strokeWidth="3" strokeLinecap="round"
              className={cn("transition-all duration-500", ringStroke)}
              strokeDasharray={`${dash} 87.96`}
            />
          </svg>
          <div className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums", scoreTone)}>
            {pct == null ? "—" : `${pct}`}
          </div>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Success</span>
          <span className={cn("text-sm font-extrabold tabular-nums", scoreTone)}>{pct == null ? "—" : `${pct}%`}</span>
        </div>
      </div>

      {/* Mini split: success vs cancelled */}
      <div className="grid grid-cols-2 gap-1">
        <div className="flex items-center justify-between rounded-md bg-background/70 px-1.5 py-0.5 ring-1 ring-inset ring-border">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">OK</span>
          <span className="text-[10px] font-bold tabular-nums">{provider.success}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-background/70 px-1.5 py-0.5 ring-1 ring-inset ring-border">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">X</span>
          <span className="text-[10px] font-bold tabular-nums">{provider.cancelled}</span>
        </div>
      </div>
    </div>
  );
}