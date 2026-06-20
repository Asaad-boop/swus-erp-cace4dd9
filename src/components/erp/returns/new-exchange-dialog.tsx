import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/contexts/brand-context";
import {
  searchOrdersForCase, listItemsForOrder, searchProductsForCase, listVariantsForProduct, createExchangeCase,
} from "@/lib/erp/returns/returns.functions";

const EXCHANGE_TYPES = [
  { key: "same_variant", label: "Same Variant" },
  { key: "different_variant", label: "Different Variant" },
  { key: "different_product", label: "Different Product" },
  { key: "refund_only", label: "Refund Only" },
];
const CONDITIONS = ["sellable", "damaged", "missing"];

export function NewExchangeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const searchOrders = useServerFn(searchOrdersForCase);
  const listItems = useServerFn(listItemsForOrder);
  const searchProducts = useServerFn(searchProductsForCase);
  const listVariants = useServerFn(listVariantsForProduct);
  const create = useServerFn(createExchangeCase);

  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderBrandId, setOrderBrandId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [exchangeType, setExchangeType] = useState("same_variant");
  const [oldCondition, setOldCondition] = useState("sellable");
  const [replacementProductId, setReplacementProductId] = useState<string | null>(null);
  const [replacementVariantId, setReplacementVariantId] = useState<string | null>(null);
  const [productQ, setProductQ] = useState("");
  const [charge, setCharge] = useState(0);
  const [returnDeliveryCost, setReturnDeliveryCost] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => { if (!open) { setQ(""); setOrderId(null); setItemId(null); setExchangeType("same_variant"); setOldCondition("sellable"); setReplacementProductId(null); setReplacementVariantId(null); setProductQ(""); setCharge(0); setReturnDeliveryCost(0); setNote(""); } }, [open]);

  const ordersQ = useQuery({
    queryKey: ["exc-search-orders", brandIds, q],
    enabled: open && brandIds.length > 0,
    queryFn: () => searchOrders({ data: { brandIds, q } }),
  });
  const itemsQ = useQuery({
    queryKey: ["exc-order-items", orderId],
    enabled: !!orderId,
    queryFn: () => listItems({ data: { orderId: orderId! } }),
  });
  const selectedItem = useMemo(() => (itemsQ.data ?? []).find((i: any) => i.id === itemId), [itemsQ.data, itemId]);

  // For "different_variant" → variants of original product. For "different_product" → product search.
  const variantProductId = exchangeType === "different_variant" ? (selectedItem?.product_id ?? null) : exchangeType === "different_product" ? replacementProductId : null;
  const variantsQ = useQuery({
    queryKey: ["exc-variants", variantProductId],
    enabled: !!variantProductId,
    queryFn: () => listVariants({ data: { productId: variantProductId! } }),
  });
  const productsQ = useQuery({
    queryKey: ["exc-search-products", brandIds, productQ],
    enabled: exchangeType === "different_product" && open,
    queryFn: () => searchProducts({ data: { brandIds, q: productQ } }),
  });

  // When exchange type changes, reset replacement
  useEffect(() => {
    if (exchangeType === "same_variant") {
      setReplacementProductId(selectedItem?.product_id ?? null);
      setReplacementVariantId(selectedItem?.variant_id ?? null);
    } else if (exchangeType === "different_variant") {
      setReplacementProductId(selectedItem?.product_id ?? null);
      setReplacementVariantId(null);
    } else if (exchangeType === "different_product") {
      setReplacementProductId(null);
      setReplacementVariantId(null);
    } else {
      setReplacementProductId(null);
      setReplacementVariantId(null);
    }
  }, [exchangeType, selectedItem]);

  const mut = useMutation({
    mutationFn: () => create({ data: {
      brandId: orderBrandId || activeBrand?.id || brandIds[0],
      orderId: orderId!,
      orderItemId: itemId ?? undefined,
      originalProductId: selectedItem?.product_id ?? undefined,
      originalVariantId: selectedItem?.variant_id ?? undefined,
      originalSku: selectedItem?.product?.sku ?? undefined,
      exchangeType,
      exchangeTypeDetail: exchangeType,
      oldItemCondition: oldCondition,
      replacementProductId: replacementProductId ?? undefined,
      replacementVariantId: replacementVariantId ?? undefined,
      replacementQty: 1,
      exchangeChargeCollected: charge,
      returnDeliveryCost,
      note: note || undefined,
    }}),
    onSuccess: () => {
      toast.success("Exchange case created");
      qc.invalidateQueries({ queryKey: ["exchanges-list"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = orderId && itemId && (exchangeType === "refund_only" || replacementProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Exchange Case</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="Search Original Order">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
            </div>
            {!orderId && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-card">
                {ordersQ.isLoading && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Loading…</div>}
                {!ordersQ.isLoading && (ordersQ.data ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">No orders found</div>}
                {(ordersQ.data ?? []).map((o: any) => (
                  <button key={o.id} type="button" onClick={() => { setOrderId(o.id); setOrderBrandId(o.brand_id); setItemId(null); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b last:border-b-0">
                    <div className="font-mono">#{String(o.id).slice(0, 8)} · {o.shipping_name ?? "—"}</div>
                    <div className="text-muted-foreground">{o.shipping_phone ?? "—"} · ৳{Number(o.total ?? 0).toLocaleString("en-IN")}</div>
                  </button>
                ))}
              </div>
            )}
            {orderId && (
              <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-mono">Order #{String(orderId).slice(0, 8)}</span>
                <button type="button" onClick={() => { setOrderId(null); setItemId(null); }} className="text-sky-600 hover:underline">Change</button>
              </div>
            )}
          </Field>

          {orderId && (
            <Field label="Original Order Item">
              <div className="max-h-40 overflow-y-auto rounded-md border bg-card">
                {(itemsQ.data ?? []).map((i: any) => (
                  <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                    className={"w-full text-left px-3 py-2 text-xs border-b last:border-b-0 " + (itemId === i.id ? "bg-indigo-50" : "hover:bg-muted/50")}>
                    <div className="font-medium">{i.product?.title ?? i.name ?? "—"}</div>
                    <div className="text-muted-foreground">Qty {i.quantity} · ৳{Number(i.unit_price ?? 0).toLocaleString("en-IN")}{i.variant_label ? " · " + i.variant_label : ""}</div>
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Exchange Type">
            <div className="flex flex-wrap gap-1">
              {EXCHANGE_TYPES.map((t) => (
                <Chip key={t.key} active={exchangeType === t.key} onClick={() => setExchangeType(t.key)}>{t.label}</Chip>
              ))}
            </div>
          </Field>

          <Field label="Old Item Condition">
            <div className="flex flex-wrap gap-1">
              {CONDITIONS.map((c) => (
                <Chip key={c} active={oldCondition === c} onClick={() => setOldCondition(c)}>{c}</Chip>
              ))}
            </div>
          </Field>

          {exchangeType === "different_variant" && selectedItem?.product_id && (
            <Field label="Replacement Variant">
              <div className="max-h-32 overflow-y-auto rounded-md border bg-card">
                {(variantsQ.data ?? []).map((v: any) => (
                  <button key={v.id} type="button" onClick={() => setReplacementVariantId(v.id)}
                    className={"w-full text-left px-3 py-2 text-xs border-b last:border-b-0 " + (replacementVariantId === v.id ? "bg-indigo-50" : "hover:bg-muted/50")}>
                    <div className="font-mono">{v.sku}</div>
                    <div className="text-muted-foreground">Stock: {v.stock ?? 0}{v.price_override ? " · ৳" + v.price_override : ""}</div>
                  </button>
                ))}
                {(variantsQ.data ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">No variants</div>}
              </div>
            </Field>
          )}

          {exchangeType === "different_product" && (
            <Field label="Replacement Product">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9" value={productQ} onChange={(e) => setProductQ(e.target.value)} placeholder="Search products…" />
              </div>
              {!replacementProductId && (
                <div className="max-h-32 overflow-y-auto rounded-md border bg-card">
                  {(productsQ.data ?? []).map((p: any) => (
                    <button key={p.id} type="button" onClick={() => setReplacementProductId(p.id)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b last:border-b-0">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-muted-foreground">{p.sku} · ৳{Number(p.price ?? 0).toLocaleString("en-IN")}</div>
                    </button>
                  ))}
                </div>
              )}
              {replacementProductId && (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
                  <span>Selected product</span>
                  <button type="button" onClick={() => { setReplacementProductId(null); setReplacementVariantId(null); }} className="text-sky-600 hover:underline">Change</button>
                </div>
              )}
              {replacementProductId && (variantsQ.data ?? []).length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto rounded-md border bg-card">
                  {(variantsQ.data ?? []).map((v: any) => (
                    <button key={v.id} type="button" onClick={() => setReplacementVariantId(v.id)}
                      className={"w-full text-left px-3 py-2 text-xs border-b last:border-b-0 " + (replacementVariantId === v.id ? "bg-indigo-50" : "hover:bg-muted/50")}>
                      <div className="font-mono">{v.sku}</div>
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Exchange Charge Collected (৳)">
              <Input type="number" min={0} value={charge} onChange={(e) => setCharge(Number(e.target.value) || 0)} className="h-9" />
            </Field>
            <Field label="Return Delivery Cost (৳)">
              <Input type="number" min={0} value={returnDeliveryCost} onChange={(e) => setReturnDeliveryCost(Number(e.target.value) || 0)} className="h-9" />
            </Field>
          </div>

          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Exchange"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>{children}</div>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={"px-2 py-1 rounded-md border text-[11px] capitalize transition-colors " + (active ? "bg-indigo-100 border-indigo-400 text-indigo-900" : "bg-card hover:bg-muted/50")}>{children}</button>;
}