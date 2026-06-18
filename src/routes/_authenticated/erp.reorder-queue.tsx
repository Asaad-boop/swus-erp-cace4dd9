import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PackageSearch, RefreshCw, Check, X, ShoppingCart, Loader2, ArrowLeft, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getReorderSuggestions,
  bulkUpdateReorderSuggestions,
  runReorderCheck,
} from "@/lib/erp/inventory/reports.functions";

export const Route = createFileRoute("/_authenticated/erp/reorder-queue")({
  head: () => ({ meta: [{ title: "Reorder Queue — Inventory" }] }),
  component: ReorderQueuePage,
});

type Suggestion = {
  id: string;
  created_at: string;
  current_stock: number;
  reorder_point: number;
  suggested_qty: number;
  status: string;
  source: string | null;
  actioned_at: string | null;
  product: { id: string; title: string; sku: string | null; weighted_avg_cost: number | null } | null;
  variant: { id: string; sku: string | null } | null;
};

function ReorderQueuePage() {
  const { activeBrand, brands, isAllBrands } = useBrand();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pickedBrand, setPickedBrand] = useState("");
  const brandId = activeBrand?.id ?? (brands.find((b) => b.id === pickedBrand)?.id ?? null);

  const [status, setStatus] = useState<"pending" | "processed" | "dismissed" | "all">("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const listFn = useServerFn(getReorderSuggestions);
  const bulkFn = useServerFn(bulkUpdateReorderSuggestions);
  const checkFn = useServerFn(runReorderCheck);

  const q = useQuery({
    queryKey: ["reorder-queue", brandId, status],
    enabled: !!brandId,
    queryFn: () => listFn({ data: { brandId: brandId!, status } }) as Promise<Suggestion[]>,
  });

  const rows = (q.data ?? []) as Suggestion[];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;

  const totalEstValue = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.id))
        .reduce((s, r) => s + r.suggested_qty * (Number(r.product?.weighted_avg_cost) || 0), 0),
    [rows, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulkMut = useMutation({
    mutationFn: (st: "processed" | "dismissed") =>
      bulkFn({ data: { ids: Array.from(selected), status: st } }),
    onSuccess: (_d, st) => {
      toast.success(`${selected.size} suggestion${selected.size > 1 ? "s" : ""} ${st}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["reorder-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const checkMut = useMutation({
    mutationFn: () => checkFn({ data: { brandId: brandId! } }),
    onSuccess: () => {
      toast.success("Reorder check complete");
      qc.invalidateQueries({ queryKey: ["reorder-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const createPoFromSelected = () => {
    const picked = rows.filter((r) => selected.has(r.id));
    if (picked.length === 0) return;
    const prefill = picked
      .filter((r) => r.product?.id)
      .map((r) => ({
        product_id: r.product!.id,
        title: r.product!.title,
        sku: r.variant?.sku || r.product?.sku || null,
        ordered_qty: r.suggested_qty,
        unit_cost: Number(r.product?.weighted_avg_cost) || 0,
        suggestion_id: r.id,
      }));
    if (prefill.length === 0) {
      toast.error("Selected items have no linked product");
      return;
    }
    sessionStorage.setItem("local-po-prefill", JSON.stringify(prefill));
    navigate({ to: "/erp/purchase-orders/new" });
  };

  if (!brandId) {
    if (isAllBrands) {
      return (
        <div className="p-6 max-w-md space-y-3">
          <h2 className="text-base font-semibold">Pick a brand</h2>
          <Select value={pickedBrand} onValueChange={setPickedBrand}>
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

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/erp/inventory"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Inventory</Button></Link>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-primary" />Reorder Queue
            </h2>
            <p className="text-[11px] text-muted-foreground">Auto-generated daily • Action items below reorder point</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => checkMut.mutate()} disabled={checkMut.isPending}>
            {checkMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Run check
          </Button>
        </div>
      </div>

      {someSelected && (
        <Card className="p-3 border-primary/40 bg-primary/5 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm">
            <span className="font-semibold">{selected.size}</span> selected
            <span className="text-muted-foreground"> • Est. value </span>
            <span className="font-semibold tabular-nums">৳{totalEstValue.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate("dismissed")} disabled={bulkMut.isPending}>
              <X className="h-4 w-4 mr-1" />Dismiss
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate("processed")} disabled={bulkMut.isPending}>
              <Check className="h-4 w-4 mr-1" />Mark processed
            </Button>
            <Button size="sm" onClick={createPoFromSelected}>
              <ShoppingCart className="h-4 w-4 mr-1" />Create PO
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-3 text-left w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={rows.length === 0} />
                </th>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-right">Current</th>
                <th className="p-3 text-right">Reorder pt</th>
                <th className="p-3 text-right">Suggested qty</th>
                <th className="p-3 text-right">WAC</th>
                <th className="p-3 text-right">Est. value</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!q.isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">
                  <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No suggestions. Stock is healthy.
                </td></tr>
              )}
              {rows.map((r) => {
                const wac = Number(r.product?.weighted_avg_cost) || 0;
                const estVal = r.suggested_qty * wac;
                const critical = r.current_stock <= 0;
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} /></td>
                    <td className="p-3">
                      <div className="font-medium">{r.product?.title ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.variant?.sku || r.product?.sku || ""}</div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {critical && <AlertTriangle className="h-3.5 w-3.5 inline mr-1 text-red-500" />}
                      <span className={critical ? "text-red-600 font-semibold" : ""}>{r.current_stock}</span>
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.reorder_point}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{r.suggested_qty}</td>
                    <td className="p-3 text-right tabular-nums">৳{wac.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums font-medium">৳{estVal.toLocaleString()}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={
                        r.status === "pending" ? "border-amber-500/40 text-amber-600" :
                        r.status === "processed" ? "border-emerald-500/40 text-emerald-600" :
                        "border-muted-foreground/30 text-muted-foreground"
                      }>{r.status}</Badge>
                    </td>
                    <td className="p-3 text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}