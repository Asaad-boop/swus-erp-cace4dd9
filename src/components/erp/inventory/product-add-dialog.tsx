import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import {
  Package, Tag, Barcode, DollarSign, AlertTriangle, RotateCcw, ImagePlus,
  Truck, Sparkles, X, Plus, Loader2, Star, Zap, Info, Film, Play, Palette, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onClose: () => void };

type ColorDraft = {
  color_name: string;
  color_hex: string;
  sku: string;
  image: string;
  opening_stock: number;
  reorder_point: number;
};

const SWATCHES = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899",
  "#f43f5e","#000000","#ffffff","#6b7280","#a3a3a3","#78350f","#1e3a8a","#365314",
];

type Form = {
  title: string;
  slug: string;
  description: string;
  brand_id: string;
  category_id: string;
  price: string;
  old_price: string;
  cost_price: string;
  sku: string;
  barcode: string;
  initial_stock: string;
  low_stock_threshold: string;
  reorder_point: string;
  reorder_qty: string;
  shipping_fee_inside: string;
  shipping_fee_outside: string;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  benefits: string[];
  specs: { key: string; value: string }[];
  image: string;
  gallery: string[];
  video_url: string;
  age_group: string;
  colors: ColorDraft[];
};

const empty = (brandId: string): Form => ({
  title: "", slug: "", description: "",
  brand_id: brandId, category_id: "",
  price: "", old_price: "", cost_price: "",
  sku: "", barcode: "",
  initial_stock: "0",
  low_stock_threshold: "5", reorder_point: "", reorder_qty: "",
  shipping_fee_inside: "", shipping_fee_outside: "",
  is_active: true, is_featured: false, is_new_arrival: false,
  benefits: [], specs: [],
  image: "", gallery: [], video_url: "",
  age_group: "",
  colors: [],
});

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

export function ProductAddDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { activeBrand, brands, isAllBrands } = useBrand();
  const defaultBrandId = activeBrand?.id ?? brands[0]?.id ?? "";
  const [f, setF] = useState<Form>(() => empty(defaultBrandId));
  const [tab, setTab] = useState("basics");
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setF(empty(defaultBrandId));
      setTab("basics");
      setSlugTouched(false);
    }
  }, [open, defaultBrandId]);

  // Auto-slug from title
  useEffect(() => {
    if (!slugTouched) setF((p) => ({ ...p, slug: slugify(p.title) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.title, slugTouched]);

  const categoriesQ = useQuery({
    queryKey: ["categories", f.brand_id],
    queryFn: async () => {
      let q = supabase.from("categories").select("id,name,brand_id").eq("is_active", true).order("display_order");
      if (f.brand_id) q = q.eq("brand_id", f.brand_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const margin = useMemo(() => {
    const p = Number(f.price), c = Number(f.cost_price);
    if (!p || !c || p <= 0) return null;
    return Math.round(((p - c) / p) * 100);
  }, [f.price, f.cost_price]);

  const valid = f.title.trim() && f.slug.trim() && f.brand_id && Number(f.price) > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("Title, slug, brand and price required");
      const num = (v: string) => (v === "" ? null : Number(v));
      const cleanSpecs = f.specs.filter((s) => s.key.trim()).reduce<Record<string, string>>(
        (a, s) => { a[s.key.trim()] = s.value; return a; }, {},
      );
      const payload: Record<string, unknown> = {
        title: f.title.trim(),
        slug: f.slug.trim(),
        description: f.description || null,
        brand_id: f.brand_id,
        category_id: f.category_id || null,
        price: Number(f.price),
        old_price: num(f.old_price),
        cost_price: num(f.cost_price),
        sku: f.sku || null,
        barcode: f.barcode || null,
        stock: Number(f.initial_stock) || 0,
        low_stock_threshold: num(f.low_stock_threshold),
        reorder_point: num(f.reorder_point),
        reorder_qty: num(f.reorder_qty),
        shipping_fee_inside: num(f.shipping_fee_inside),
        shipping_fee_outside: num(f.shipping_fee_outside),
        is_active: f.is_active,
        is_featured: f.is_featured,
        is_new_arrival: f.is_new_arrival,
        benefits: f.benefits.filter(Boolean),
        specs: cleanSpecs,
        image: f.image || null,
        gallery: f.gallery,
        video_url: f.video_url || null,
        age_group: f.age_group || null,
      };
      const { data, error } = await supabase.from("products").insert(payload as never).select("id").single();
      if (error) throw error;
      const newProductId = (data as { id: string }).id;

      // Seed opening stock movement so weighted_avg_cost is correct
      const startStock = Number(f.initial_stock) || 0;
      if (startStock > 0) {
        await supabase.rpc("adjust_stock_v2", {
          _product_id: newProductId,
          _variant_id: null as unknown as string,
          _delta: startStock,
          _reason: "stock_in",
          _note: "Opening stock",
          _unit_cost: f.cost_price ? Number(f.cost_price) : undefined,
          _source: "manual",
        });
      }

      // Insert color variants
      const validColors = f.colors.filter((c) => c.color_name.trim());
      if (validColors.length > 0) {
        const rows = validColors.map((c, idx) => ({
          product_id: newProductId,
          color_name: c.color_name.trim(),
          color_hex: c.color_hex || null,
          sku: c.sku || null,
          image: c.image || null,
          stock: Math.max(0, Math.floor(c.opening_stock || 0)),
          reorder_point: Math.max(0, Math.floor(c.reorder_point || 0)),
          is_active: true,
          display_order: idx,
        }));
        const { data: inserted, error: vErr } = await supabase
          .from("product_variants")
          .insert(rows as never)
          .select("id,color_name,stock");
        if (vErr) throw vErr;
        // Opening stock movements per variant
        for (const v of (inserted ?? []) as { id: string; color_name: string; stock: number }[]) {
          if (v.stock > 0) {
            await supabase.from("stock_movements").insert({
              product_id: newProductId,
              variant_id: v.id,
              delta: v.stock,
              reason: "opening_stock",
              note: `Opening stock for ${v.color_name}`,
              movement_source: "manual",
            } as never);
          }
        }
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            Add Product
          </DialogTitle>
          <DialogDescription>Full product details — images, pricing, stock, shipping & metadata.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
          <div className="px-6 pt-3">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="basics" className="gap-1.5"><Info className="h-3.5 w-3.5" />Basics</TabsTrigger>
              <TabsTrigger value="images" className="gap-1.5"><ImagePlus className="h-3.5 w-3.5" />Images</TabsTrigger>
              <TabsTrigger value="pricing" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />Pricing</TabsTrigger>
              <TabsTrigger value="colors" className="gap-1.5"><Palette className="h-3.5 w-3.5" />Colors</TabsTrigger>
              <TabsTrigger value="shipping" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Shipping</TabsTrigger>
              <TabsTrigger value="details" className="gap-1.5"><Star className="h-3.5 w-3.5" />Details</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[60vh]">
            <div className="px-6 py-5">
              {/* BASICS */}
              <TabsContent value="basics" className="mt-0 space-y-4">
                <Field label="Title" required>
                  <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Toyora Mini Excavator" />
                </Field>
                <Field label="Slug" required hint="Auto-generated — used in product URL">
                  <Input
                    value={f.slug}
                    onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }}
                    placeholder="toyora-mini-excavator"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Brand" required>
                    <Select value={f.brand_id} onValueChange={(v) => { set("brand_id", v); set("category_id", ""); }}>
                      <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isAllBrands && <p className="text-[11px] text-amber-600 mt-1">Pick the brand explicitly</p>}
                  </Field>
                  <Field label="Category">
                    <Select value={f.category_id || "none"} onValueChange={(v) => set("category_id", v === "none" ? "" : v)} disabled={!f.brand_id}>
                      <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorized</SelectItem>
                        {(categoriesQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Shop by Age" hint="Toyora storefront e age filter er jonno">
                  <Select value={f.age_group || "none"} onValueChange={(v) => set("age_group", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="All ages" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">All ages</SelectItem>
                      <SelectItem value="0-2">0 – 2 years</SelectItem>
                      <SelectItem value="3-5">3 – 5 years</SelectItem>
                      <SelectItem value="6-8">6 – 8 years</SelectItem>
                      <SelectItem value="9-12">9 – 12 years</SelectItem>
                      <SelectItem value="13+">13+ years</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Description">
                  <Textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Short product description shown on storefront…" />
                </Field>
                <div className="flex items-center gap-6 pt-1">
                  <ToggleRow icon={<Zap className="h-4 w-4 text-emerald-500" />} label="Active" checked={f.is_active} onChange={(v) => set("is_active", v)} />
                  <ToggleRow icon={<Star className="h-4 w-4 text-amber-500" />} label="Featured" checked={f.is_featured} onChange={(v) => set("is_featured", v)} />
                  <ToggleRow icon={<Sparkles className="h-4 w-4 text-blue-500" />} label="New arrival" checked={f.is_new_arrival} onChange={(v) => set("is_new_arrival", v)} />
                </div>
              </TabsContent>

              {/* IMAGES */}
              <TabsContent value="images" className="mt-0 space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Main image</Label>
                  <ImageUploader
                    value={f.image}
                    onChange={(url) => set("image", url)}
                    onClear={() => set("image", "")}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Gallery ({f.gallery.length})</Label>
                  <GalleryUploader
                    items={f.gallery}
                    onAdd={(url) => set("gallery", [...f.gallery, url])}
                    onRemove={(i) => set("gallery", f.gallery.filter((_, idx) => idx !== i))}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
                    <Film className="h-3.5 w-3.5" /> Product video
                    <span className="text-[10px] font-normal text-muted-foreground">(autoplays on thumbnail)</span>
                  </Label>
                  <VideoUploader
                    value={f.video_url}
                    poster={f.image}
                    onChange={(url) => set("video_url", url)}
                    onClear={() => set("video_url", "")}
                  />
                </div>
              </TabsContent>

              {/* PRICING */}
              <TabsContent value="pricing" className="mt-0 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Price (BDT)" required icon={<DollarSign className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0" />
                  </Field>
                  <Field label="Compare-at price" hint="Shown struck-through">
                    <Input type="number" value={f.old_price} onChange={(e) => set("old_price", e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Cost price" icon={<DollarSign className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="Unit cost" />
                  </Field>
                </div>
                {margin !== null && (
                  <div className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                    margin >= 30 ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : margin >= 10 ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-red-200 bg-red-50 text-red-700",
                  )}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Margin: <strong>{margin}%</strong>
                    <span className="text-muted-foreground">· profit ৳{(Number(f.price) - Number(f.cost_price)).toFixed(0)}</span>
                  </div>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SKU" icon={<Tag className="h-3.5 w-3.5" />}>
                    <Input value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. TOY-MX-001" />
                  </Field>
                  <Field label="Barcode" icon={<Barcode className="h-3.5 w-3.5" />}>
                    <Input value={f.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Scan or type" />
                  </Field>
                </div>
                <Separator />
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock & reorder</div>
                <div className="grid grid-cols-4 gap-4">
                  <Field label="Opening stock" icon={<Package className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.initial_stock} onChange={(e) => set("initial_stock", e.target.value)} />
                  </Field>
                  <Field label="Low stock alert" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}>
                    <Input type="number" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} placeholder="5" />
                  </Field>
                  <Field label="Reorder point" icon={<RotateCcw className="h-3.5 w-3.5 text-blue-500" />}>
                    <Input type="number" value={f.reorder_point} onChange={(e) => set("reorder_point", e.target.value)} placeholder="Trigger" />
                  </Field>
                  <Field label="Reorder qty">
                    <Input type="number" value={f.reorder_qty} onChange={(e) => set("reorder_qty", e.target.value)} placeholder="Suggest" />
                  </Field>
                </div>
              </TabsContent>

              {/* SHIPPING */}
              <TabsContent value="shipping" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">Override default shipping rates for this product. Leave blank to use brand defaults.</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Inside Dhaka (BDT)" icon={<Truck className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.shipping_fee_inside} onChange={(e) => set("shipping_fee_inside", e.target.value)} placeholder="e.g. 60" />
                  </Field>
                  <Field label="Outside Dhaka (BDT)" icon={<Truck className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.shipping_fee_outside} onChange={(e) => set("shipping_fee_outside", e.target.value)} placeholder="e.g. 120" />
                  </Field>
                </div>
              </TabsContent>

              {/* DETAILS */}
              <TabsContent value="details" className="mt-0 space-y-5">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Key benefits / bullet points</Label>
                  <ListEditor
                    items={f.benefits}
                    placeholder="e.g. Rechargeable battery"
                    onChange={(arr) => set("benefits", arr)}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Specifications (key → value)</Label>
                  <SpecsEditor specs={f.specs} onChange={(arr) => set("specs", arr)} />
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="border-t bg-muted/30 px-6 py-3 flex !justify-between items-center">
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {!valid && <Badge variant="outline" className="text-amber-700 border-amber-300">Missing: title, slug, brand, price</Badge>}
            {valid && <Badge variant="outline" className="text-emerald-700 border-emerald-300">Ready to save</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!valid || save.isPending} className="gap-1.5">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {save.isPending ? "Creating…" : "Create Product"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------ helpers ------------------ */

function Field({
  label, hint, icon, required, children,
}: {
  label: string; hint?: string; icon?: React.ReactNode; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
        {icon}{label}{required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ icon, label, checked, onChange }: {
  icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

async function uploadToBucket(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    cacheControl: "3600", upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

function VideoUploader({ value, poster, onChange, onClear }: {
  value: string; poster?: string; onChange: (url: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video too large (max 50MB)");
      return;
    }
    setBusy(true);
    try { onChange(await uploadToBucket(file)); toast.success("Video uploaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 flex items-start gap-3">
      <div
        onClick={() => !value && ref.current?.click()}
        className={cn(
          "relative h-32 w-32 shrink-0 rounded-xl border-2 border-dashed grid place-items-center overflow-hidden transition",
          value ? "border-transparent bg-black cursor-default" : "border-border hover:border-primary/40 hover:bg-muted/40 cursor-pointer",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : value ? (
              <video
                src={value}
                poster={poster || undefined}
                className="h-full w-full object-cover"
                muted autoPlay loop playsInline
              />
            )
          : <div className="text-center text-muted-foreground">
              <Play className="h-6 w-6 mx-auto mb-1" />
              <div className="text-[11px]">Click to upload</div>
            </div>}
        {value && !busy && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste video URL (mp4 / webm)"
        />
        <p className="text-[11px] text-muted-foreground">
          MP4 / WebM — autoplays muted on product thumbnail. Max 50MB. Falls back to main image as poster.
        </p>
      </div>
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

function ImageUploader({ value, onChange, onClear }: {
  value: string; onChange: (url: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true);
    try { onChange(await uploadToBucket(file)); toast.success("Image uploaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 flex items-start gap-3">
      <div
        onClick={() => ref.current?.click()}
        className={cn(
          "relative h-32 w-32 shrink-0 rounded-xl border-2 border-dashed grid place-items-center cursor-pointer transition",
          value ? "border-transparent" : "border-border hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : value ? <img src={value} alt="" className="h-full w-full rounded-xl object-cover" />
          : <div className="text-center text-muted-foreground">
              <ImagePlus className="h-6 w-6 mx-auto mb-1" />
              <div className="text-[11px]">Click to upload</div>
            </div>}
        {value && !busy && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste image URL"
        />
        <p className="text-[11px] text-muted-foreground">PNG / JPG / WebP — auto-uploaded to product-images bucket.</p>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

function GalleryUploader({ items, onAdd, onRemove }: {
  items: string[]; onAdd: (url: string) => void; onRemove: (i: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) onAdd(await uploadToBucket(file));
      toast.success(`${files.length} image(s) uploaded`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 grid grid-cols-5 gap-2">
      {items.map((url, i) => (
        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-background/90 border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3 w-3" /></button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="aspect-square rounded-lg border-2 border-dashed grid place-items-center hover:border-primary/40 hover:bg-muted/40 transition text-muted-foreground"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
      </button>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
    </div>
  );
}

function ListEditor({ items, placeholder, onChange }: {
  items: string[]; placeholder?: string; onChange: (arr: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => { if (!draft.trim()) return; onChange([...items, draft.trim()]); setDraft(""); };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function SpecsEditor({ specs, onChange }: {
  specs: { key: string; value: string }[]; onChange: (s: { key: string; value: string }[]) => void;
}) {
  const update = (i: number, patch: Partial<{ key: string; value: string }>) =>
    onChange(specs.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  return (
    <div className="mt-2 space-y-2">
      {specs.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input value={s.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="e.g. Material" />
          <Input value={s.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="e.g. ABS Plastic" />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(specs.filter((_, idx) => idx !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...specs, { key: "", value: "" }])} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />Add spec
      </Button>
    </div>
  );
}