import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Truck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShipments } from "@/hooks/erp/use-courier-query";
import { pathaoTrackFn } from "@/lib/erp/pathao.functions";
import { PathaoSettings } from "@/components/erp/courier/pathao-settings";

export const Route = createFileRoute("/_authenticated/erp/courier")({
  head: () => ({ meta: [{ title: "Courier — ERP" }] }),
  component: CourierPage,
});

function statusTone(s: string | null) {
  const v = (s ?? "").toLowerCase();
  if (v.includes("deliver")) return "bg-emerald-100 text-emerald-800";
  if (v.includes("return")) return "bg-red-100 text-red-800";
  if (v.includes("transit") || v.includes("hub")) return "bg-amber-100 text-amber-800";
  if (v.includes("pickup") || v.includes("request")) return "bg-blue-100 text-blue-800";
  if (v.includes("cancel")) return "bg-zinc-200 text-zinc-700";
  return "bg-muted text-muted-foreground";
}

function CourierPage() {
  const qc = useQueryClient();
  const { data: shipments = [], isLoading } = useShipments();
  const trackFn = useServerFn(pathaoTrackFn);

  const [q, setQ] = useState("");
  const [provider, setProvider] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return shipments.filter((s) => {
      if (provider !== "all" && s.provider !== provider) return false;
      if (status === "delivered" && !(s.status ?? "").toLowerCase().includes("deliver")) return false;
      if (status === "transit" && !(s.status ?? "").toLowerCase().match(/transit|hub|pickup|request/)) return false;
      if (status === "returned" && !(s.status ?? "").toLowerCase().includes("return")) return false;
      if (!term) return true;
      return (
        s.consignment_id?.toLowerCase().includes(term) ||
        s.tracking_code?.toLowerCase().includes(term) ||
        s.orders?.shipping_phone?.toLowerCase().includes(term) ||
        s.orders?.shipping_name?.toLowerCase().includes(term) ||
        s.order_id.toLowerCase().includes(term)
      );
    });
  }, [shipments, q, provider, status]);

  const refresh = useMutation({
    mutationFn: async (id: string) => trackFn({ data: { shipmentId: id } }),
    onSuccess: (r) => {
      toast.success(`Status: ${r.status ?? "updated"}`);
      qc.invalidateQueries({ queryKey: ["courier-shipments"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyId(null),
  });

  const totals = useMemo(() => {
    const t = { total: shipments.length, delivered: 0, transit: 0, returned: 0, fee: 0 };
    for (const s of shipments) {
      const v = (s.status ?? "").toLowerCase();
      if (v.includes("deliver")) t.delivered++;
      else if (v.includes("return")) t.returned++;
      else t.transit++;
      t.fee += Number(s.delivery_fee ?? 0);
    }
    return t;
  }, [shipments]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Courier</h1>
        <p className="text-sm text-muted-foreground">Pathao consignments. Book from any order's detail drawer.</p>
      </div>
      <Tabs defaultValue="shipments">
        <TabsList>
          <TabsTrigger value="shipments">Shipments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="shipments" className="space-y-4 pt-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total shipments" value={totals.total} />
        <Stat label="In transit" value={totals.transit} />
        <Stat label="Delivered" value={totals.delivered} />
        <Stat label="Courier charges" value={`৳ ${totals.fee.toLocaleString()}`} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Shipments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Input
              placeholder="Search by consignment, phone, name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="pathao">Pathao</SelectItem>
                <SelectItem value="steadfast">Steadfast</SelectItem>
                <SelectItem value="redx">RedX</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="transit">In transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Consignment</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">No shipments yet</TableCell></TableRow>
                ) : filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(s.created_at), "dd MMM, hh:mm a")}</TableCell>
                    <TableCell className="font-mono text-xs">{s.consignment_id ?? "—"}</TableCell>
                    <TableCell className="capitalize">{s.provider}</TableCell>
                    <TableCell className="text-sm">
                      <div>{s.orders?.shipping_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.orders?.shipping_phone ?? ""}</div>
                    </TableCell>
                    <TableCell><Badge className={statusTone(s.status)}>{s.status ?? "—"}</Badge></TableCell>
                    <TableCell className="text-right">৳ {Number(s.delivery_fee ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!s.consignment_id || (busyId === s.id && refresh.isPending)}
                        onClick={() => { setBusyId(s.id); refresh.mutate(s.id); }}
                      >
                        {busyId === s.id && refresh.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                      {s.consignment_id && (
                        <a
                          href={`https://merchant.pathao.com/courier/orders?search=${encodeURIComponent(s.consignment_id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 inline-flex"
                        >
                          <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="settings" className="pt-3">
          <PathaoSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}