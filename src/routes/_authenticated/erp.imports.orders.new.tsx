import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Plus, Trash2, Package, Boxes, Wallet, Truck, AlertTriangle,
  Loader2, FileText, Sparkles, SplitSquareHorizontal, Save,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  createImportPo, listImportSuppliers,
  updatePoLandedCost,
} from "@/lib/erp/imports/imports.functions";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { fmtBdt, newIdemKey } from "@/lib/erp/imports/types";
import { ProductPicker, type PickedProduct } from "@/components/erp/imports/product-picker";
import { AmountPercentInput } from "@/components/erp/amount-percent-input";
import { LandedCostCard } from "@/components/erp/imports/landed-cost-card";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/new")({
  head: () => ({ meta: [{ title: "New Purchase Order — Imports" }] }),
  component: NewPoPage,
});

type ItemDraft = {
  id: string;
  picked: PickedProduct;
  quantity: number;
  unit_cost_foreign: number;
};

type CartonDraft = {
  id: string;
  carton_number: number;
  weight_kg: number;
  allocations: Record<string, number>;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const emptyPick = (): PickedProduct => ({ id: null, title: "", sku: null, image: null });

function NewPoPage() {
  const { activeBrand, brands, isAllBrands } = useBrand();
  const navigate = useNavigate();
  const [pickedBrandId, setPickedBrandId] = useState<string>("");
  const effectiveBrand = useMemo(
    () => activeBrand ?? brands.find((b) => b.id === pickedBrandId) ?? null,
    [activeBrand, brands, pickedBrandId],
  );
  const brandId = effectiveBrand?.id ?? null;

  const suppliersFn = useServerFn(listImportSuppliers);
  const createFn = useServerFn(createImportPo);
  const landedFn = useServerFn(updatePoLandedCost);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["imp-suppliers", brandId], enabled: !!brandId,
    queryFn: () => suppliersFn({ data: { brandId: brandId! } }),
  });
  const { data: wallets = [] } = useAccounts(brandId ? [brandId] : []);

  // form state
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState<string>("");
  const [currency, setCurrency] = useState("CNY");
  const [fxRate, setFxRate] = useState<number>(14);
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ItemDraft[]>([
    { id: uid(), picked: emptyPick(), quantity: 1, unit_cost_foreign: 0 },
  ]);
  const [cartons, setCartons] = useState<CartonDraft[]>([
    { id: uid(), carton_number: 1, weight_kg: 0, allocations: {} },
  ]);

  // initial payment
  const [payEnabled, setPayEnabled] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payWalletId, setPayWalletId] = useState<string>("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");

  // landed cost preview state (will be persisted post-create if non-zero)
  const [landed, setLanded] = useState({
    fx_rate_cny_bdt: 14,
    freight_cost_bdt: 0,
    customs_duty_bdt: 0,
    other_charges_bdt: 0,
  });

  // computed
  const productSubtotalForeign = items.reduce((s, i) => s + i.quantity * i.unit_cost_foreign, 0);
  const productSubtotalBdt = productSubtotalForeign * (fxRate || 0);

  const totalAllocated = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((it) => { map[it.id] = 0; });
    cartons.forEach((c) => {
      Object.entries(c.allocations).forEach(([itemId, q]) => {
        if (map[itemId] !== undefined) map[itemId] += Number(q) || 0;
      });
    });
    return map;
  }, [items, cartons]);

  const reconciliationErrors = useMemo(() => {
    return items.flatMap((it) => {
      const allocated = totalAllocated[it.id] ?? 0;
      if (allocated !== it.quantity) {
        return [`${it.picked.title || "Item"}: allocated ${allocated} / ${it.quantity}`];
      }
      return [];
    });
  }, [items, totalAllocated]);

  const selectedWallet = wallets.find((w) => w.id === payWalletId);
  const walletAfter = selectedWallet ? Number(selectedWallet.current_balance) - payAmount : null;

  // actions
  const addItem = () => setItems((xs) => [...xs, { id: uid(), picked: emptyPick(), quantity: 1, unit_cost_foreign: 0 }]);
  const removeItem = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const updItem = (id: string, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addCarton = () => setCartons((cs) => [...cs, { id: uid(), carton_number: cs.length + 1, weight_kg: 0, allocations: {} }]);
  const removeCarton = (id: string) => setCartons((cs) => cs.filter((c) => c.id !== id).map((c, idx) => ({ ...c, carton_number: idx + 1 })));
  const updCarton = (id: string, patch: Partial<CartonDraft>) => setCartons((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setAlloc = (cartonId: string, itemId: string, q: number) =>
    setCartons((cs) => cs.map((c) => (c.id === cartonId ? { ...c, allocations: { ...c.allocations, [itemId]: q } } : c)));

  const autoSplit = () => {
    if (cartons.length === 0) return;
    setCartons((cs) =>
      cs.map((c, ci) => {
        const newAlloc: Record<string, number> = {};
        items.forEach((it) => {
          const base = Math.floor(it.quantity / cs.length);
          const rem = it.quantity - base * cs.length;
          newAlloc[it.id] = base + (ci < rem ? 1 : 0);
        });
        return { ...c, allocations: newAlloc };
      }),
    );
  };

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      if (items.some((i) => !i.picked.title.trim() || i.quantity <= 0)) throw new Error("Each item needs a name & quantity > 0");
      if (reconciliationErrors.length > 0) throw new Error("Carton allocations don't match item quantities");
      if (payEnabled && (payAmount <= 0 || !payWalletId)) throw new Error("Payment amount & wallet required");

      const itemList = items.map((it) => ({
        product_id: it.picked.id ?? undefined,
        name_snapshot: it.picked.title.trim(),
        sku_snapshot: it.picked.sku ?? undefined,
        image_snapshot: it.picked.image ?? undefined,
        quantity: it.quantity,
        unit_cost_foreign: it.unit_cost_foreign,
      }));

      const cartonList = cartons.map((c) => ({
        carton_number: c.carton_number,
        weight_kg: c.weight_kg || 0,
        allocations: items
          .map((it, idx) => ({ item_index: idx, quantity: c.allocations[it.id] ?? 0 }))
          .filter((a) => a.quantity > 0),
      }));

      const payload: any = {
        brand_id: brandId,
        order_date: orderDate,
        currency,
        fx_rate: fxRate,
        notes: notes || undefined,
        items: itemList,
        cartons: cartonList,
        idempotency_key: newIdemKey("po"),
      };
      if (supplierId) payload.supplier = { id: supplierId };

      if (payEnabled && payAmount > 0 && payWalletId) {
        payload.initial_payment = {
          amount_bdt: payAmount,
          wallet_id: payWalletId,
          payment_date: payDate,
          reference: payRef || undefined,
          payment_type: "supplier_advance",
          idempotency_key: newIdemKey("pay"),
        };
      }

      const res: any = await createFn({ data: payload });
      // Persist landed cost details if any extras entered (best-effort; non-blocking)
      const hasExtras =
        (landed.freight_cost_bdt || 0) > 0 ||
        (landed.customs_duty_bdt || 0) > 0 ||
        (landed.other_charges_bdt || 0) > 0;
      if (res?.po_id && hasExtras) {
        try {
          const { data: createdItems } = await supabaseClient
            .from("imp_po_items")
            .select("id, name_snapshot, quantity, unit_cost_foreign")
            .eq("po_id", res.po_id)
            .order("created_at");
          if (createdItems?.length) {
            await landedFn({
              data: {
                po_id: res.po_id,
                fx_rate_cny_bdt: landed.fx_rate_cny_bdt || fxRate,
                fx_rate_source: "manual",
                freight_cost_bdt: landed.freight_cost_bdt || 0,
                customs_duty_bdt: landed.customs_duty_bdt || 0,
                other_charges_bdt: landed.other_charges_bdt || 0,
                items: createdItems.map((it: any) => ({
                  id: it.id,
                  unit_cost_cny: Number(it.unit_cost_foreign) || 0,
                })),
                lock_rate: true,
              },
            });
          }
        } catch { /* fail-soft */ }
      }
      return res;
    },
    onSuccess: (res: any) => {
      toast.success(`PO ${res?.po_number ?? "created"} successfully`);
      if (res?.po_id) navigate({ to: "/erp/imports/orders/$orderId", params: { orderId: res.po_id } });
      else navigate({ to: "/erp/imports/orders" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create PO"),
  });

  if (!brandId) {
    if (isAllBrands) {
      return (
        <div className="p-6 max-w-md space-y-3">
          <h2 className="text-base font-semibold">Pick a brand</h2>
          <p className="text-sm text-muted-foreground">All-Brands mode — purchase order ta kon brand er under e create hobe?</p>
          <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
            <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
            <SelectContent>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return <div className="p-6 text-sm text-muted-foreground">Select a brand.</div>;
  }

  const totalCartonWeight = cartons.reduce((s, c) => s + (Number(c.weight_kg) || 0), 0);
  const totalUnits = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const itemsValid = items.length > 0 && items.every((i) => i.picked.title.trim() && i.quantity > 0);
  const canSubmit = itemsValid && reconciliationErrors.length === 0 && !submitMut.isPending && (!payEnabled || (payAmount > 0 && !!payWalletId));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/erp/imports/orders"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />New Purchase Order</h2>
            <p className="text-[11px] text-muted-foreground">Brand: {effectiveBrand?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5"><Sparkles className="h-3 w-3" />Draft</Badge>
          <Button size="sm" disabled={!canSubmit} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><Save className="h-4 w-4 mr-2" />Create PO</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">

          {/* Header card */}
          <Card className="p-4 md:p-5">
            <SectionTitle icon={Package} title="Order info" />
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <Label className="text-xs">Order date</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Supplier <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={supplierId || "__none"} onValueChange={(v) => setSupplierId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {(suppliers as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">FX rate (1 {currency} = ? BDT)</Label>
                <Input type="number" step="0.0001" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value))} />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
              </div>
            </div>
          </Card>

          {/* Items */}
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionTitle icon={Boxes} title={`Items (${items.length})`} />
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add item</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick from inventory or create new. PO confirm korle inventory-te "Incoming" hisebe dekhabe.
            </p>
            <div className="mt-3 space-y-2">
              {items.map((it) => {
                const subBdt = it.quantity * it.unit_cost_foreign * (fxRate || 0);
                return (
                  <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-md border border-border bg-card/50">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs">Product</Label>
                      <ProductPicker
                        brandId={brandId!}
                        value={it.picked}
                        onChange={(p) => updItem(it.id, { picked: p })}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={it.quantity}
                        onChange={(e) => updItem(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-xs">Unit ({currency})</Label>
                      <Input type="number" step="0.01" value={it.unit_cost_foreign}
                        onChange={(e) => updItem(it.id, { unit_cost_foreign: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3 md:col-span-2 text-right">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Subtotal</div>
                      <div className="font-semibold tabular-nums text-sm">{fmtBdt(subBdt)}</div>
                    </div>
                    <div className="col-span-1 text-right">
                      <Button size="icon" variant="ghost" disabled={items.length === 1} onClick={() => removeItem(it.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end text-sm">
              <div className="space-y-1 text-right">
                <div><span className="text-muted-foreground">Total ({currency}): </span><span className="font-semibold tabular-nums">{productSubtotalForeign.toFixed(2)}</span></div>
                <div className="text-base"><span className="text-muted-foreground">Product subtotal: </span><span className="font-bold tabular-nums">{fmtBdt(productSubtotalBdt)}</span></div>
              </div>
            </div>
          </Card>

          {/* Cartons */}
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionTitle icon={Truck} title={`Cartons (${cartons.length})`} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={autoSplit}><SplitSquareHorizontal className="h-3.5 w-3.5 mr-1" />Auto-split</Button>
                <Button size="sm" variant="outline" onClick={addCarton}><Plus className="h-3.5 w-3.5 mr-1" />Add carton</Button>
              </div>
            </div>
            {reconciliationErrors.length > 0 && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 text-xs">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-orange-700 dark:text-orange-300 mb-1">Carton allocation mismatch</div>
                  {reconciliationErrors.map((e, i) => <div key={i} className="text-orange-700 dark:text-orange-400">• {e}</div>)}
                </div>
              </div>
            )}
            <div className="mt-3 space-y-3">
              {cartons.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-card/50 p-3">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <div className="font-mono text-sm font-semibold px-2 py-1 rounded bg-primary/10 text-primary">CTN-{c.carton_number}</div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Weight (kg)</Label>
                      <Input type="number" step="0.1" className="w-24 h-8" value={c.weight_kg}
                        onChange={(e) => updCarton(c.id, { weight_kg: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="ml-auto">
                      <Button size="icon" variant="ghost" disabled={cartons.length === 1} onClick={() => removeCarton(c.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate">{it.picked.title || "—"}</span>
                        <Input
                          type="number" min={0} max={it.quantity}
                          className="w-20 h-8 text-right"
                          value={c.allocations[it.id] ?? 0}
                          onChange={(e) => setAlloc(c.id, it.id, Number(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Landed cost calculator (preview) */}
          <LandedCostCard
            brandId={brandId!}
            items={items.map((it) => ({
              id: it.id,
              name: it.picked.title || "—",
              quantity: it.quantity,
              unit_cost_cny: it.unit_cost_foreign,
            }))}
            initialFxRate={fxRate}
            initialFreight={landed.freight_cost_bdt}
            initialCustoms={landed.customs_duty_bdt}
            initialOther={landed.other_charges_bdt}
            onChange={(v) => {
              setLanded(v);
              if (v.fx_rate_cny_bdt && v.fx_rate_cny_bdt !== fxRate) setFxRate(v.fx_rate_cny_bdt);
            }}
          />

          {/* Initial payment */}
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionTitle icon={Wallet} title="Advance payment (optional)" />
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={payEnabled} onChange={(e) => setPayEnabled(e.target.checked)} className="rounded" />
                Pay supplier advance now
              </label>
            </div>
            {payEnabled && (
              <div className="grid md:grid-cols-2 gap-4 mt-3">
                <AmountPercentInput
                  total={productSubtotalBdt}
                  amount={payAmount}
                  onChange={setPayAmount}
                  label={`Amount (BDT) — of ${fmtBdt(productSubtotalBdt)} subtotal`}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs">Wallet</Label>
                  <Select value={payWalletId} onValueChange={setPayWalletId}>
                    <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                    <SelectContent>
                      {wallets.filter((w) => w.is_active).map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {walletAfter !== null && (
                    <div className={`text-[11px] ${walletAfter < 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      After: {fmtBdt(walletAfter)}{walletAfter < 0 ? " ⚠ negative" : ""}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Reference</Label>
                  <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Sticky sidebar */}
        <div className="lg:sticky lg:top-24 space-y-3">
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-card border-primary/20">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Grand total</div>
            <div className="text-2xl font-bold tabular-nums">{fmtBdt(productSubtotalBdt)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{productSubtotalForeign.toFixed(2)} {currency} @ {fxRate}</div>
          </Card>

          <Card className="p-4 space-y-2.5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Summary</div>
            <SideRow label="Supplier" value={supplierId ? ((suppliers as any[]).find((s) => s.id === supplierId)?.name ?? "—") : <span className="text-muted-foreground italic">None</span>} />
            <SideRow label="Order date" value={orderDate} />
            <SideRow label="Currency" value={`${currency} @ ${fxRate}`} />
            <div className="border-t border-border my-2" />
            <SideRow label="Items" value={`${items.length}`} />
            <SideRow label="Total units" value={totalUnits.toLocaleString()} />
            <SideRow label="Cartons" value={`${cartons.length}`} />
            <SideRow label="Total weight" value={`${totalCartonWeight.toFixed(1)} kg`} />
            <div className="border-t border-border my-2" />
            <SideRow label="Subtotal" value={fmtBdt(productSubtotalBdt)} bold />
            {payEnabled && payAmount > 0 && (
              <>
                <SideRow label="Advance" value={`− ${fmtBdt(payAmount)}`} accent="text-emerald-600" />
                <SideRow label="Due after" value={fmtBdt(Math.max(0, productSubtotalBdt - payAmount))} bold accent={productSubtotalBdt - payAmount > 0 ? "text-orange-600" : "text-emerald-600"} />
              </>
            )}
          </Card>

          {reconciliationErrors.length > 0 && (
            <Card className="p-3 border-orange-500/30 bg-orange-500/5">
              <div className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-orange-700 dark:text-orange-300 mb-1">Carton mismatch</div>
                  <div className="text-orange-700/80 dark:text-orange-400/80">Fix carton allocations before submit.</div>
                </div>
              </div>
            </Card>
          )}

          <Button size="lg" className="w-full" disabled={!canSubmit} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><Save className="h-4 w-4 mr-2" />Create Purchase Order</>}
          </Button>

          <Card className="p-3 text-[11px] text-muted-foreground leading-relaxed">
            <div className="font-semibold text-foreground mb-1 text-xs">Tips</div>
            <ul className="space-y-1 list-disc ml-4">
              <li>Item picker theke existing product link koro, qty inventory-te "Incoming" hisebe dekhabe.</li>
              <li>Auto-split items kore cartons-e shoman ke distribute kore.</li>
              <li>Percent box-e type korle amount auto fillup hobe.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SideRow({ label, value, bold, accent }: { label: string; value: React.ReactNode; bold?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm tabular-nums text-right truncate", bold && "font-bold", accent)}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="font-semibold">{title}</h3>
    </div>
  );
}