import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import type { ProductRow } from "@/lib/erp/inventory";
import { Package, Tag, Barcode, DollarSign, AlertTriangle, RotateCcw } from "lucide-react";

type FormState = {
  title: string;
  price: string;
  sku: string;
  barcode: string;
  cost_price: string;
  low_stock_threshold: string;
  reorder_point: string;
  reorder_qty: string;
  is_active: boolean;
};

function fromProduct(p: ProductRow): FormState {
  return {
    title: p.title ?? "",
    price: String(p.price ?? ""),
    sku: p.sku ?? "",
    barcode: p.barcode ?? "",
    cost_price: p.cost_price != null ? String(p.cost_price) : "",
    low_stock_threshold: p.low_stock_threshold != null ? String(p.low_stock_threshold) : "",
    reorder_point: p.reorder_point != null ? String(p.reorder_point) : "",
    reorder_qty: p.reorder_qty != null ? String(p.reorder_qty) : "",
    is_active: !!p.is_active,
  };
}

export function ProductEditDialog({
  product,
  onClose,
}: {
  product: ProductRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(() => (product ? fromProduct(product) : ({} as FormState)));

  useEffect(() => {
    if (product) setF(fromProduct(product));
  }, [product?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!product) return;
      // 1) Update basic product fields directly (title, price, is_active)
      const priceNum = Number(f.price);
      const { error: pErr } = await supabase
        .from("products")
        .update({
          title: f.title.trim(),
          price: Number.isFinite(priceNum) ? priceNum : product.price,
          is_active: f.is_active,
        })
        .eq("id", product.id);
      if (pErr) throw pErr;

      // 2) Update inventory-related fields via RPC (sku/barcode/cost/threshold/reorder)
      const num = (v: string) => (v === "" ? undefined : Number(v));
      const { error: iErr } = await supabase.rpc("update_product_inventory_fields", {
        _product_id: product.id,
        _low_stock_threshold: num(f.low_stock_threshold),
        _reorder_point: num(f.reorder_point),
        _cost_price: num(f.cost_price),
        _sku: f.sku === "" ? undefined : f.sku,
        _barcode: f.barcode === "" ? undefined : f.barcode,
      } as any);
      if (iErr) throw iErr;

      // 3) reorder_qty — try direct update (column may exist on products)
      if (f.reorder_qty !== "") {
        const rq = Number(f.reorder_qty);
        if (Number.isFinite(rq)) {
          await supabase.from("products").update({ reorder_qty: rq } as any).eq("id", product.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!product) return null;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Edit Product
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          {product.image ? (
            <img src={product.image} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-border" />
          ) : (
            <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{product.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{product.slug}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="active-switch" className="text-xs">Active</Label>
            <Switch
              id="active-switch"
              checked={f.is_active}
              onCheckedChange={(v) => setF({ ...f, is_active: v })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <Field label="Title" full>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>

          <Field label="Price (BDT)" icon={<DollarSign className="h-3.5 w-3.5" />}>
            <Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label="Cost Price (BDT)" icon={<DollarSign className="h-3.5 w-3.5" />}>
            <Input type="number" value={f.cost_price} onChange={(e) => setF({ ...f, cost_price: e.target.value })} placeholder="Unit cost" />
          </Field>

          <Field label="SKU" icon={<Tag className="h-3.5 w-3.5" />}>
            <Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="SKU code" />
          </Field>
          <Field label="Barcode" icon={<Barcode className="h-3.5 w-3.5" />}>
            <Input value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} placeholder="Scan or type" />
          </Field>
        </div>

        <Separator className="my-1" />
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reorder & alerts</div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Low Stock Threshold" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}>
            <Input type="number" value={f.low_stock_threshold} onChange={(e) => setF({ ...f, low_stock_threshold: e.target.value })} placeholder="e.g. 5" />
          </Field>
          <Field label="Reorder Point" icon={<RotateCcw className="h-3.5 w-3.5 text-blue-500" />}>
            <Input type="number" value={f.reorder_point} onChange={(e) => setF({ ...f, reorder_point: e.target.value })} placeholder="Trigger qty" />
          </Field>
          <Field label="Reorder Qty" icon={<Package className="h-3.5 w-3.5 text-indigo-500" />}>
            <Input type="number" value={f.reorder_qty} onChange={(e) => setF({ ...f, reorder_qty: e.target.value })} placeholder="Suggested PO qty" />
          </Field>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  icon,
  children,
  full,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}