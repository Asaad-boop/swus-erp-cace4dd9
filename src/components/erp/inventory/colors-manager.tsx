import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Palette, Plus, Trash2, X, ImagePlus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Variant = {
  id: string;
  product_id: string;
  color_name: string | null;
  color_hex: string | null;
  sku: string | null;
  image: string | null;
  stock: number;
  reserved_stock: number;
  available_stock: number;
  reorder_point: number;
  is_active: boolean;
  display_order: number;
};

type DraftRow = {
  id?: string;
  color_name: string;
  color_hex: string;
  sku: string;
  image: string;
  opening_stock: number; // used only on create
  reorder_point: number;
  is_active: boolean;
  _dirty?: boolean;
  _new?: boolean;
};

const SWATCHES = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899",
  "#f43f5e","#000000","#ffffff","#6b7280","#a3a3a3","#78350f","#1e3a8a","#365314",
];

async function uploadColorImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `colors/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

export function ColorsManager({ productId, productSku, baseImage }: { productId: string; productSku: string | null; baseImage: string | null }) {
  const qc = useQueryClient();
  const variantsQ = useQuery({
    queryKey: ["product-variants", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,product_id,color_name,color_hex,sku,image,stock,reserved_stock,available_stock,reorder_point,is_active,display_order")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Variant[];
    },
  });

  const [rows, setRows] = useState<DraftRow[]>([]);
  useEffect(() => {
    if (variantsQ.data) {
      setRows(variantsQ.data.map((v) => ({
        id: v.id,
        color_name: v.color_name ?? "",
        color_hex: v.color_hex ?? "",
        sku: v.sku ?? "",
        image: v.image ?? "",
        opening_stock: v.stock,
        reorder_point: v.reorder_point ?? 0,
        is_active: v.is_active,
      })));
    }
  }, [variantsQ.data]);

  const set = (idx: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, _dirty: true } : r)));

  const addRow = () => {
    const n = rows.length + 1;
    const suffix = (productSku ? productSku + "-" : "") + `C${String(n).padStart(2, "0")}`;
    setRows((prev) => [...prev, {
      color_name: "", color_hex: SWATCHES[(n - 1) % SWATCHES.length], sku: suffix,
      image: "", opening_stock: 0, reorder_point: 0, is_active: true, _new: true, _dirty: true,
    }]);
  };

  const saveRow = useMutation({
    mutationFn: async (idx: number) => {
      const r = rows[idx];
      if (!r.color_name.trim()) throw new Error("Color name required");
      if (r.color_hex && !/^#[0-9a-fA-F]{6}$/.test(r.color_hex)) throw new Error("Invalid hex");
      if (r._new || !r.id) {
        const { data, error } = await supabase
          .from("product_variants")
          .insert({
            product_id: productId,
            color_name: r.color_name.trim(),
            color_hex: r.color_hex || null,
            sku: r.sku || null,
            image: r.image || null,
            stock: Math.max(0, Math.floor(r.opening_stock || 0)),
            reorder_point: Math.max(0, Math.floor(r.reorder_point || 0)),
            is_active: r.is_active,
            display_order: idx,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        // Log opening stock movement
        if ((r.opening_stock || 0) > 0 && data?.id) {
          await supabase.from("stock_movements").insert({
            product_id: productId,
            variant_id: data.id,
            delta: r.opening_stock,
            reason: "opening_stock",
            note: `Opening stock for ${r.color_name}`,
            movement_source: "manual",
          } as never);
        }
      } else {
        const { error } = await supabase
          .from("product_variants")
          .update({
            color_name: r.color_name.trim(),
            color_hex: r.color_hex || null,
            sku: r.sku || null,
            image: r.image || null,
            reorder_point: Math.max(0, Math.floor(r.reorder_point || 0)),
            is_active: r.is_active,
            display_order: idx,
          } as never)
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Color saved");
      qc.invalidateQueries({ queryKey: ["product-variants", productId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRow = useMutation({
    mutationFn: async (idx: number) => {
      const r = rows[idx];
      if (!r.id) { setRows((p) => p.filter((_, i) => i !== idx)); return; }
      // Soft delete: deactivate
      const { error } = await supabase
        .from("product_variants")
        .update({ is_active: false } as never)
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Color removed");
      qc.invalidateQueries({ queryKey: ["product-variants", productId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (variantsQ.isLoading) {
    return <div className="py-6 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          {rows.length === 0 ? "Konono color nai. Add korle por shei color e separate stock track hobe." :
            `${rows.filter((r) => r.is_active).length} active color${rows.filter((r) => r.is_active).length === 1 ? "" : "s"}`}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />Add color
        </Button>
      </div>

      {rows.length === 0 && (
        <button
          type="button"
          onClick={addRow}
          className="w-full rounded-xl border-2 border-dashed border-border py-8 grid place-items-center text-muted-foreground hover:border-primary/40 hover:bg-muted/40 transition"
        >
          <Palette className="h-7 w-7 mb-2" />
          <div className="text-sm font-medium">Add the first color</div>
          <div className="text-[11px] mt-0.5">e.g. Red, Blue, Black</div>
        </button>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => {
          const v = variantsQ.data?.find((x) => x.id === r.id);
          const stock = v?.stock ?? 0;
          const reserved = v?.reserved_stock ?? 0;
          const available = v?.available_stock ?? stock;
          return (
            <div key={r.id ?? `new-${i}`} className={cn(
              "group rounded-xl border bg-card/40 p-3 space-y-2.5 transition",
              !r.is_active && "opacity-50",
              r._dirty && "ring-1 ring-amber-300/60",
            )}>
              <div className="flex items-center gap-2.5">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <div className="relative">
                  <ColorSwatchPicker value={r.color_hex} onChange={(hex) => set(i, { color_hex: hex })} />
                </div>
                <Input
                  value={r.color_name}
                  onChange={(e) => set(i, { color_name: e.target.value })}
                  placeholder="Color name (e.g. Red)"
                  className="h-9 font-medium"
                />
                {r.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      Stock <strong className="ml-1">{stock}</strong>
                    </Badge>
                    {reserved > 0 && <Badge variant="outline" className="text-[10px] tabular-nums text-amber-700 border-amber-300">
                      Reserved {reserved}
                    </Badge>}
                    <Badge variant="outline" className="text-[10px] tabular-nums text-emerald-700 border-emerald-300">
                      Available {available}
                    </Badge>
                  </div>
                )}
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeRow.mutate(i)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>

              <div className="grid grid-cols-[80px_1fr_120px_120px_auto] gap-2 items-end pl-6">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Photo</Label>
                  <ColorImage value={r.image} fallback={baseImage} onChange={(url) => set(i, { image: url })} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">SKU</Label>
                  <Input value={r.sku} onChange={(e) => set(i, { sku: e.target.value })} className="h-8 text-xs" placeholder="Optional" />
                </div>
                {!r.id && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Opening stock</Label>
                    <Input type="number" min={0} value={r.opening_stock}
                      onChange={(e) => set(i, { opening_stock: Math.max(0, Number(e.target.value) || 0) })} className="h-8 text-xs" />
                  </div>
                )}
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Low stock at</Label>
                  <Input type="number" min={0} value={r.reorder_point}
                    onChange={(e) => set(i, { reorder_point: Math.max(0, Number(e.target.value) || 0) })} className="h-8 text-xs" />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={r._dirty ? "default" : "outline"}
                  disabled={!r._dirty || saveRow.isPending}
                  onClick={() => saveRow.mutate(i)}
                  className="h-8"
                >
                  {saveRow.isPending && saveRow.variables === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>

              {r.id && (
                <div className="text-[10px] text-muted-foreground pl-6">
                  Stock change korte hole Inventory page-e variant select kore Stock Adjust use korun.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 rounded-lg border-2 border-border shadow-sm hover:scale-105 transition"
        style={{ background: value || "linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0, 4px 4px" }}
        title={value || "Pick color"}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-11 left-0 w-60 rounded-xl border bg-popover p-3 shadow-2xl space-y-2">
            <div className="grid grid-cols-8 gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={cn(
                    "h-6 w-6 rounded-md border shadow-sm hover:scale-110 transition",
                    value?.toLowerCase() === c.toLowerCase() && "ring-2 ring-primary ring-offset-1",
                  )}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1 border-t">
              <input
                type="color"
                value={value || "#000000"}
                onChange={(e) => onChange(e.target.value)}
                className="h-7 w-9 rounded cursor-pointer bg-transparent"
              />
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#RRGGBB"
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ColorImage({ value, fallback, onChange }: { value: string; fallback: string | null; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    setBusy(true);
    try { onChange(await uploadColorImage(file)); toast.success("Uploaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const src = value || fallback || "";
  return (
    <div
      onClick={() => ref.current?.click()}
      className={cn(
        "relative h-12 w-12 rounded-lg border border-dashed grid place-items-center cursor-pointer overflow-hidden transition",
        src ? "border-transparent ring-1 ring-border" : "border-border hover:border-primary/40",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : src ? <img src={src} alt="" className="h-full w-full object-cover" />
        : <ImagePlus className="h-4 w-4 text-muted-foreground" />}
      {value && !busy && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }}
          className="absolute top-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-background/90 border shadow-sm hover:bg-destructive hover:text-white"
        ><X className="h-2.5 w-2.5" /></button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}