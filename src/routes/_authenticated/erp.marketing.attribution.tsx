import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, X, Search, Link2, Check, Ban } from "lucide-react";
import { format } from "date-fns";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  listAttributionOrders,
  listBrandCampaigns,
  bulkResolveAttributions,
  resolveOrderAttribution,
  setManualAttribution,
  clearAttribution,
  backfillCampaignProductLinks,
  listAttributionCandidates,
  acceptAttributionCandidate,
  dismissAttributionCandidate,
} from "@/lib/erp/marketing/attribution.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/attribution")({
  component: AttributionPage,
});

const SOURCE_COLOR: Record<string, string> = {
  utm: "bg-emerald-100 text-emerald-800",
  pixel: "bg-blue-100 text-blue-800",
  phone_match: "bg-amber-100 text-amber-800",
  product_link: "bg-purple-100 text-purple-800",
  manual: "bg-slate-100 text-slate-800",
};

function AttributionPage() {
  const qc = useQueryClient();
  const { brandId, effectiveBrand, picker } = useBrandPicker();

  const [tab, setTab] = useState<"unattributed" | "candidates" | "attributed">("unattributed");
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listAttributionOrders);
  const campFn = useServerFn(listBrandCampaigns);
  const bulkFn = useServerFn(bulkResolveAttributions);
  const oneFn = useServerFn(resolveOrderAttribution);
  const setManFn = useServerFn(setManualAttribution);
  const clearFn = useServerFn(clearAttribution);
  const backfillFn = useServerFn(backfillCampaignProductLinks);
  const listCandFn = useServerFn(listAttributionCandidates);
  const acceptCandFn = useServerFn(acceptAttributionCandidate);
  const dismissCandFn = useServerFn(dismissAttributionCandidate);

  const ordersQ = useQuery({
    queryKey: ["mkt", "attribution-orders", brandId, tab, days],
    queryFn: () => listFn({ data: { brandId: brandId!, mode: tab, days } }),
    enabled: !!brandId && tab !== "candidates",
  });

  const candsQ = useQuery({
    queryKey: ["mkt", "attribution-candidates", brandId],
    queryFn: () => listCandFn({ data: { brandId: brandId!, status: "pending" } }),
    enabled: !!brandId && tab === "candidates",
  });

  const campsQ = useQuery({
    queryKey: ["mkt", "brand-campaigns", brandId],
    queryFn: () => campFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const bulkMut = useMutation({
    mutationFn: () => bulkFn({ data: { brandId: brandId!, days } }),
    onSuccess: (r) => {
      toast.success(`Scanned ${r.scanned} — attributed ${r.attributed}`);
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backfillMut = useMutation({
    mutationFn: () => backfillFn({ data: { brandId: brandId ?? null } }),
    onSuccess: (r) => {
      toast.success(`Linked ${r.linked} products — skipped ${r.skipped} (already linked)`);
      qc.invalidateQueries({ queryKey: ["mkt"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const oneMut = useMutation({
    mutationFn: (orderId: string) => oneFn({ data: { orderId } }),
    onSuccess: (r) => {
      if (r.attributed) toast.success(`Attributed via ${r.source}`);
      else toast.message("No match found");
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setManMut = useMutation({
    mutationFn: (p: { orderId: string; campaignId: string }) => setManFn({ data: p }),
    onSuccess: () => {
      toast.success("Manual attribution set");
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: (orderId: string) => clearFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Attribution cleared");
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptCandMut = useMutation({
    mutationFn: (candidateId: string) => acceptCandFn({ data: { candidateId } }),
    onSuccess: () => {
      toast.success("Candidate accepted");
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-candidates"] });
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismissCandMut = useMutation({
    mutationFn: (candidateId: string) => dismissCandFn({ data: { candidateId } }),
    onSuccess: () => {
      toast.success("Candidate dismissed");
      qc.invalidateQueries({ queryKey: ["mkt", "attribution-candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = ordersQ.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((o: any) =>
      String(o.order_number ?? "").toLowerCase().includes(q) ||
      String(o.customer_phone ?? "").toLowerCase().includes(q) ||
      String(o.customer_name ?? "").toLowerCase().includes(q),
    );
  }, [ordersQ.data, search]);

  const candRows = useMemo(() => {
    const all = candsQ.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((o: any) =>
      String(o.order_number ?? "").toLowerCase().includes(q) ||
      String(o.customer_phone ?? "").toLowerCase().includes(q) ||
      String(o.customer_name ?? "").toLowerCase().includes(q),
    );
  }, [candsQ.data, search]);

  const campaigns = campsQ.data ?? [];

  return (
    <div className="space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Order Attribution</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              UTM, pixel (fbclid), phone match, product link priority. Manual override sob shomoy possible.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7d</SelectItem>
                <SelectItem value="30">Last 30d</SelectItem>
                <SelectItem value="90">Last 90d</SelectItem>
                <SelectItem value="180">Last 180d</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => bulkMut.mutate()}
              disabled={bulkMut.isPending || !brandId}
            >
              {bulkMut.isPending
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                : <Sparkles className="mr-1 h-4 w-4" />}
              Auto-resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => backfillMut.mutate()}
              disabled={backfillMut.isPending}
              title="Existing attributed orders er products campaign e auto-link koro"
            >
              {backfillMut.isPending
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                : <Link2 className="mr-1 h-4 w-4" />}
              Backfill Product Links
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search order #, name, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="unattributed">Unattributed</TabsTrigger>
              <TabsTrigger value="candidates">
                Low-conf candidates
                {candsQ.data?.length ? ` (${candsQ.data.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="attributed">Attributed</TabsTrigger>
            </TabsList>
            <TabsContent value="unattributed" className="mt-3">
              <OrdersTable
                mode="unattributed"
                loading={ordersQ.isLoading}
                rows={rows}
                campaigns={campaigns}
                onResolve={(id) => oneMut.mutate(id)}
                onManual={(orderId, campaignId) => setManMut.mutate({ orderId, campaignId })}
                onClear={(id) => clearMut.mutate(id)}
                pending={oneMut.isPending || setManMut.isPending}
              />
            </TabsContent>
            <TabsContent value="candidates" className="mt-3">
              <CandidatesTable
                loading={candsQ.isLoading}
                rows={candRows}
                onAccept={(id) => acceptCandMut.mutate(id)}
                onDismiss={(id) => dismissCandMut.mutate(id)}
                pending={acceptCandMut.isPending || dismissCandMut.isPending}
              />
            </TabsContent>
            <TabsContent value="attributed" className="mt-3">
              <OrdersTable
                mode="attributed"
                loading={ordersQ.isLoading}
                rows={rows}
                campaigns={campaigns}
                onResolve={(id) => oneMut.mutate(id)}
                onManual={(orderId, campaignId) => setManMut.mutate({ orderId, campaignId })}
                onClear={(id) => clearMut.mutate(id)}
                pending={oneMut.isPending || setManMut.isPending}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

type TableProps = {
  mode: "unattributed" | "attributed";
  loading: boolean;
  rows: any[];
  campaigns: any[];
  onResolve: (id: string) => void;
  onManual: (orderId: string, campaignId: string) => void;
  onClear: (id: string) => void;
  pending: boolean;
};

function OrdersTable({ mode, loading, rows, campaigns, onResolve, onManual, onClear, pending }: TableProps) {
  if (loading) {
    return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No orders.</div>;
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>UTM / Click</TableHead>
            {mode === "attributed" && <TableHead>Campaign</TableHead>}
            {mode === "attributed" && <TableHead>Source</TableHead>}
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-72">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium text-sm">{o.order_number || o.id.slice(0, 8)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                {o.created_at ? format(new Date(o.created_at), "dd MMM") : "—"}
              </TableCell>
              <TableCell className="text-sm">
                <div>{o.customer_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{o.customer_phone || ""}</div>
              </TableCell>
              <TableCell className="text-xs">
                <div>{o.utm_campaign || <span className="text-muted-foreground">no utm</span>}</div>
                {o.fbclid && <div className="text-muted-foreground truncate max-w-[180px]" title={o.fbclid}>fbclid: {o.fbclid.slice(0, 14)}…</div>}
              </TableCell>
              {mode === "attributed" && (
                <TableCell className="text-sm">{o.attribution?.mkt_campaigns?.name || "—"}</TableCell>
              )}
              {mode === "attributed" && (
                <TableCell>
                  <Badge className={`${SOURCE_COLOR[o.attribution?.source] ?? "bg-slate-100"} hover:opacity-90`}>
                    {o.attribution?.source} {o.attribution?.confidence ? `· ${(o.attribution.confidence * 100).toFixed(0)}%` : ""}
                  </Badge>
                </TableCell>
              )}
              <TableCell className="text-right">৳ {Number(o.total_amount || 0).toLocaleString()}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {mode === "unattributed" && (
                    <Button size="sm" variant="outline" onClick={() => onResolve(o.id)} disabled={pending}>
                      Try auto
                    </Button>
                  )}
                  <Select onValueChange={(v) => onManual(o.id, v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Map to campaign…" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.length === 0
                        ? <SelectItem value="__none__" disabled>No campaigns synced</SelectItem>
                        : campaigns.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  {mode === "attributed" && (
                    <Button size="icon" variant="ghost" onClick={() => onClear(o.id)} title="Clear">
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}