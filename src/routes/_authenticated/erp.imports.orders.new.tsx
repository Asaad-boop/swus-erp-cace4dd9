import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Package, Boxes, Wallet, Truck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createImportPurchaseOrder, listCargoAgents, listImportSuppliers, listWarehouses,
} from "@/lib/erp/imports/imports.functions";
import { fmtBdt, newIdemKey } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/new")({
  head: () => ({ meta: [{ title: "New Purchase Order — Imports" }] }),
  component: NewPoPage,
});

type ItemDraft = {
  id: string;
  name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  unit_cost_foreign: number;
};

type CartonDraft = {
  id: string;
  carton_number: number;
  weight_kg: number;
  allocations: Record<string, number>; // item.id -> qty
};

function uid() { return Math.random().toString(36).slice(2, 10); }

function NewPoPage() {
  const { activeBrand } = useBrand();
  const navigate = useNavigate();
  const brandId = activeBrand?.id ?? null;

  const suppliersFn = useServerFn(listImportSuppliers);
  const agentsFn = useServerFn(listCargoAgents);
  const whFn = useServerFn(listWarehouses);
  const createFn = useServerFn(createImportPurchaseOrder);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["imp-suppliers", brandId], enabled: !!brandId,
    queryFn: () => suppliersFn({ data: { brandId: brandId! } }),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["imp-agents", brandId], enabled: !!brandId,
    queryFn: () => agentsFn({ data: { brandId: brandId! } }),
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ["imp-wh", brandId], enabled: !!brandId,
    queryFn: () => whFn({ data: { brandId: brandId! } }),
  });
  const { data: wallets = [] } = useAccounts(brandId);

  // form state
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>("");
  const [currency, setCurrency] = useState("CNY");
  const [fxRate, setFxRate] = useState<number>(14);
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ItemDraft[]>([
    { id: uid(), name_snapshot: "", sku_snapshot: "", quantity: 1, unit_cost_foreign: 0 },
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
        return [`${it.name_snapshot || "Item"}: allocated ${allocated} / ${it.quantity}`];
      }
      return [];
    });
  }, [items, totalAllocated]);

  const selectedWallet = wallets.find((w) => w.id === payWalletId);
  const walletAfter = selectedWallet ? Number(selectedWallet.current_balance) - payAmount : null;

  // actions
  const addItem = () => setItems((xs) => [...xs, { id: uid(), name_snapshot: "", sku_snapshot: "", quantity: 1, unit_cost_foreign: 0 }]);
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
      if (!supplierId) throw new Error("Supplier required");
      if (items.some((i) => !i.name_snapshot || i.quantity <= 0)) throw new Error("Each item needs a name & quantity > 0");
      if (reconciliationErrors.length > 0) throw new Error("Carton allocations don't match item quantities");

      const itemList = items.map((it, idx) => ({
        _index: idx,
        name_snapshot: it.name_snapshot,
        sku_snapshot: it.sku_snapshot || undefined,
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
        supplier_id: supplierId,
        cargo_agent_id: agentId || undefined,
        order_date: orderDate,
        currency,
        fx_rate: fxRate,
        notes: notes || undefined,
        items: itemList.map(({ _index, ...rest }) => rest),
        cartons: cartonList,
        idempotency_key: newIdemKey("po"),
      };

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

      return await createFn({ data: payload });
    },
    onSuccess: (res: any) => {
      toast.success(`PO ${res?.po_number ?? "created"} successfully`);
      if (res?.po_id) navigate({ to: "/erp/imports/orders/$orderId", params: { orderId: res.po_id } });
      else navigate({ to: "/erp/imports/orders" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create PO"),
  });

  if (!brandId) return <div className="p-6 text-sm text-muted-foreground">Select a brand.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link to="/erp/imports/orders"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
        <div>
          <h2 className="text-xl font-bold">New Purchase Order</h2>
          <p className="text-xs text-muted-foreground">Brand: {activeBrand?.name}</p>
        </div>
      </div>

      {/* Order Info */}
      <Card className="p-5">
        <SectionTitle icon={Package} title="Order Info" />
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <div><Label>Order Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div>
            <Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No suppliers. Add one in Settings.</div>}
                {(suppliers as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cargo Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {(agents as any[]).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} /></div>
          <div><Label>FX Rate (1 {currency} = ? BDT)</Label><Input type="number" step="0.0001" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value))} /></div>
          <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
        </div>
      </Card>

      {/* Items */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Boxes} title={`Items (${items.length})`} />
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add item</Button>
        </div>
        <div className="mt-3 space-y-2">
          {items.map((it) => {
            const subBdt = it.quantity * it.unit_cost_foreign * (fxRate || 0);
            return (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-md border border-border bg-card/50">
                <div className="col-span-12 md:col-span-4"><Label className="text-xs">Name</Label><Input value={it.name_snapshot} onChange={(e) => updItem(it.id, { name_snapshot: e.target.value })} placeholder="Product name" /></div>
                <div className="col-span-6 md:col-span-2"><Label className="text-xs">SKU</Label><Input value={it.sku_snapshot} onChange={(e) => updItem(it.id, { sku_snapshot: e.target.value })} placeholder="Optional" /></div>
                <div className="col-span-3 md:col-span-1"><Label className="text-xs">Qty</Label><Input type="number" min={1} value={it.quantity} onChange={(e) => updItem(it.id, { quantity: Number(e.target.value) })} /></div>
                <div className="col-span-3 md:col-span-2"><Label className="text-xs">Unit ({currency})</Label><Input type="number" step="0.01" value={it.unit_cost_foreign} onChange={(e) => updItem(it.id, { unit_cost_foreign: Number(e.target.value) })} /></div>
                <div className="col-span-9 md:col-span-2 text-right"><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-semibold tabular-nums">{fmtBdt(subBdt)}</div></div>
                <div className="col-span-3 md:col-span-1 text-right"><Button size="icon" variant="ghost" disabled={items.length === 1} onClick={() => removeItem(it.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end text-sm">
          <div className="space-y-1 text-right">
            <div><span className="text-muted-foreground">Total ({currency}): </span><span className="font-semibold tabular-nums">{productSubtotalForeign.toFixed(2)}</span></div>
            <div className="text-base"><span className="text-muted-foreground">Product Subtotal: </span><span className="font-bold tabular-nums">{fmtBdt(productSubtotalBdt)}</span></div>
          </div>
        </div>
      </Card>

      {/* Cartons */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SectionTitle icon={Truck} title={`Cartons (${cartons.length})`} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={autoSplit}>Auto-split evenly</Button>
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
                  <Label className="text-xs">Weight (kg)</Label>
                  <Input type="number" step="0.1" className="w-24 h-8" value={c.weight_kg} onChange={(e) => updCarton(c.id, { weight_kg: Number(e.target.value) })} />
                </div>
                <div className="ml-auto">
                  <Button size="icon" variant="ghost" disabled={cartons.length === 1} onClick={() => removeCarton(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{it.name_snapshot || "—"}</span>
                    <Input
                      type="number" min={0} max={it.quantity}
                      className="w-20 h-8 text-right"
                      value={c.allocations[it.id] ?? 0}
                      onChange={(e) => setAlloc(c.id, it.id, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Initial Payment */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Wallet} title="Initial Payment (Optional)" />
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={payEnabled} onChange={(e) => setPayEnabled(e.target.checked)} className="rounded" />
            Pay supplier advance now
          </label>
        </div>
        {payEnabled && (
          <div className="grid md:grid-cols-4 gap-3 mt-3">
            <div><Label>Amount (BDT)</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} /></div>
            <div>
              <Label>Wallet</Label>
              <Select value={payWalletId} onValueChange={setPayWalletId}>
                <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>
                  {wallets.filter((w) => w.is_active).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {walletAfter !== null && (
                <div className={`text-[11px] mt-1 ${walletAfter < 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  After: {fmtBdt(walletAfter)}{walletAfter < 0 ? " ⚠ negative balance" : ""}
                </div>
              )}
            </div>
            <div><Label>Date</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <div><Label>Reference</Label><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" /></div>
          </div>
        )}
      </Card>

      {/* Summary + Submit */}
      <Card className="p-5 sticky bottom-2 shadow-lg border-primary/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Items</div><div className="font-semibold">{items.length}</div></div>
            <div><div className="text-xs text-muted-foreground">Cartons</div><div className="font-semibold">{cartons.length}</div></div>
            <div><div className="text-xs text-muted-foreground">Subtotal</div><div className="font-semibold tabular-nums">{fmtBdt(productSubtotalBdt)}</div></div>
          </div>
          <Button size="lg" disabled={submitMut.isPending || reconciliationErrors.length > 0 || !supplierId} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create Purchase Order"}
          </Button>
        </div>
      </Card>
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