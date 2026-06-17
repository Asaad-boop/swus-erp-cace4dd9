import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, PackageCheck, CheckCircle2, PlaneLanding, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgentPurchaseOrder, requestCartonRelease, markPoArrivedBd, confirmAgentPayment } from "@/lib/erp/imports/agent.functions";
import { PO_STATUS_LABEL, CARTON_STATUS_LABEL, fmtBdt, type ImpPoStatus, type ImpCartonStatus } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_agent/agent/orders/$orderId")({
  head: () => ({ meta: [{ title: "PO Detail — Cargo Agent" }] }),
  component: AgentOrderDetail,
});

function AgentOrderDetail() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getAgentPurchaseOrder);
  const releaseFn = useServerFn(requestCartonRelease);
  const arrivedFn = useServerFn(markPoArrivedBd);
  const confirmFn = useServerFn(confirmAgentPayment);
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-po", orderId],
    queryFn: () => fn({ data: { poId: orderId } }),
    retry: false,
  });

  const [releaseCarton, setReleaseCarton] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [shippedAt, setShippedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [weightKg, setWeightKg] = useState<string>("");
  const [rateBdt, setRateBdt] = useState<string>("");
  const [confirmPay, setConfirmPay] = useState<any | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofNote, setProofNote] = useState("");

  const releaseMut = useMutation({
    mutationFn: (vars: { cartonId: string; note?: string }) => releaseFn({ data: vars }),
    onSuccess: () => {
      toast.success("Release request pathano hoyeche");
      setReleaseCarton(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["agent-po", orderId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const arrivedMut = useMutation({
    mutationFn: (vars: { poId: string; shipped_at: string; total_weight_kg: number; per_kg_rate_bdt: number }) =>
      arrivedFn({ data: vars }),
    onSuccess: () => {
      toast.success("PO mark kora hoyeche as Arrived in BD");
      setArrivedOpen(false);
      setWeightKg("");
      setRateBdt("");
      qc.invalidateQueries({ queryKey: ["agent-po", orderId] });
      qc.invalidateQueries({ queryKey: ["agent-pos"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const confirmMut = useMutation({
    mutationFn: (vars: { paymentId: string; proof_url?: string; note?: string }) =>
      confirmFn({ data: vars }),
    onSuccess: () => {
      toast.success("Payment confirm + cartons released");
      setConfirmPay(null);
      setProofUrl("");
      setProofNote("");
      qc.invalidateQueries({ queryKey: ["agent-po", orderId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error) {
    return (
      <div className="p-6 space-y-2">
        <Link to="/agent/orders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to orders
        </Link>
        <div className="text-sm text-destructive font-medium">PO load korte parlam na</div>
        <div className="text-xs text-muted-foreground break-words">{(error as any)?.message ?? "Unknown error"}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 space-y-2">
        <Link to="/agent/orders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to orders
        </Link>
        <div className="text-sm">PO khuje paowa jayni.</div>
      </div>
    );
  }

  const po = data.po as any;
  const items = data.items as any[];
  const cartons = data.cartons as any[];
  const payments = data.payments as any[];

  const canMarkArrived = ["ordered", "at_china_warehouse", "in_transit"].includes(po.status);

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link to="/agent/orders" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono">{po.po_number}</h1>
            <Badge variant="secondary" className={PO_STATUS_LABEL[po.status as ImpPoStatus]?.tone}>
              {PO_STATUS_LABEL[po.status as ImpPoStatus]?.label ?? po.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">{po.order_date} · {po.supplier?.name ?? "No supplier"}</div>
        </div>
        {canMarkArrived && (
          <Button onClick={() => setArrivedOpen(true)}>
            <PlaneLanding className="h-4 w-4 mr-1.5" /> Mark Arrived in BD
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Subtotal" value={fmtBdt(po.product_subtotal_bdt)} />
        <Stat label="Shipping" value={fmtBdt(po.shipping_total_bdt)} />
        <Stat label="Grand Total" value={fmtBdt(po.grand_total_bdt)} accent="text-foreground" />
        <Stat label="Due" value={fmtBdt(po.due_bdt)} accent="text-orange-600" />
      </div>

      {(po.shipped_at || po.total_weight_kg) && (
        <Card className="p-4 flex flex-wrap gap-6 text-sm">
          {po.shipped_at && (
            <div>
              <div className="text-xs text-muted-foreground">Shipped / Arrived BD</div>
              <div className="font-semibold">{po.shipped_at}</div>
            </div>
          )}
          {po.total_weight_kg != null && (
            <div>
              <div className="text-xs text-muted-foreground">Total Weight</div>
              <div className="font-semibold tabular-nums">{po.total_weight_kg} kg</div>
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border"><h2 className="font-semibold">Items</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit (BDT)</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Kono item nei.</TableCell></TableRow>
            ) : items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">{it.sku_snapshot}</TableCell>
                <TableCell className="text-sm">{it.name_snapshot}</TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtBdt(it.unit_cost_bdt)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtBdt(it.subtotal_bdt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Cartons</h2>
          <span className="text-xs text-muted-foreground">Total {cartons.length}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Weight (kg)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Landed</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cartons.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Kono carton nei.</TableCell></TableRow>
            ) : cartons.map((c) => {
              const requested = !!c.release_requested_at;
              const released = !!c.released_at;
              return (
                <TableRow key={c.id}>
                  <TableCell className="tabular-nums">{c.carton_number}</TableCell>
                  <TableCell className="font-mono text-xs">{c.barcode}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.expected_quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.weight_kg ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={CARTON_STATUS_LABEL[c.status as ImpCartonStatus]?.tone}>
                      {CARTON_STATUS_LABEL[c.status as ImpCartonStatus]?.label ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(c.total_landed_bdt)}</TableCell>
                  <TableCell className="text-right">
                    {released ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Released</span>
                    ) : requested ? (
                      <span className="text-xs text-amber-600">Requested</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setReleaseCarton(c)}>
                        <PackageCheck className="h-3 w-3 mr-1" /> Request release
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border"><h2 className="font-semibold">Payments Received</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Confirm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Akhono kono payment nei.</TableCell></TableRow>
            ) : payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{p.payment_date}</TableCell>
                <TableCell className="text-sm capitalize">{p.payment_type ?? "—"}</TableCell>
                <TableCell className="text-sm">{p.reference ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.notes ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums font-medium text-emerald-600">{fmtBdt(p.amount_bdt)}</TableCell>
                <TableCell className="text-right">
                  {p.agent_confirmed_at ? (
                    <div className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Confirmed
                      {p.agent_proof_url && (
                        <a href={p.agent_proof_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline">
                          proof <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConfirmPay(p)}>
                      <ShieldCheck className="h-3 w-3 mr-1" /> Confirm
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!releaseCarton} onOpenChange={(o) => { if (!o) { setReleaseCarton(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carton release request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm">Carton <b>#{releaseCarton?.carton_number}</b> ({releaseCarton?.barcode})</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for importer…" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReleaseCarton(null)}>Cancel</Button>
            <Button
              disabled={releaseMut.isPending}
              onClick={() => releaseCarton && releaseMut.mutate({ cartonId: releaseCarton.id, note: note || undefined })}
            >
              {releaseMut.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={arrivedOpen} onOpenChange={setArrivedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Arrived in BD</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              PO <b>{po.po_number}</b> ke "Arrived in BD" status e move korbe. Shipping date ar total weight diye dao.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shipped_at">Shipping Date</Label>
              <Input id="shipped_at" type="date" value={shippedAt} onChange={(e) => setShippedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight_kg">Total Weight (KG)</Label>
              <Input
                id="weight_kg"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 45.5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate_bdt">Per-KG Rate (BDT)</Label>
              <Input
                id="rate_bdt"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 850"
                value={rateBdt}
                onChange={(e) => setRateBdt(e.target.value)}
              />
            </div>
            {Number(weightKg) > 0 && Number(rateBdt) > 0 && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">Total Shipping</span>
                <span className="font-semibold tabular-nums">{fmtBdt(Number(weightKg) * Number(rateBdt))}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArrivedOpen(false)}>Cancel</Button>
            <Button
              disabled={arrivedMut.isPending || !shippedAt || !weightKg || Number(weightKg) <= 0 || !rateBdt || Number(rateBdt) <= 0}
              onClick={() => arrivedMut.mutate({
                poId: po.id,
                shipped_at: shippedAt,
                total_weight_kg: Number(weightKg),
                per_kg_rate_bdt: Number(rateBdt),
              })}
            >
              {arrivedMut.isPending ? "Saving…" : "Confirm Arrival"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmPay} onOpenChange={(o) => { if (!o) { setConfirmPay(null); setProofUrl(""); setProofNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm payment received</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              Amount <b className="text-emerald-600">{confirmPay && fmtBdt(confirmPay.amount_bdt)}</b>
              {confirmPay?.payment_date && <span className="text-muted-foreground"> · {confirmPay.payment_date}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              Confirm korle related cartons auto-release hoye jabe.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proof_url">Proof URL (receipt / screenshot link)</Label>
              <Input id="proof_url" placeholder="https://…" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proof_note">Note (optional)</Label>
              <Textarea id="proof_note" rows={2} value={proofNote} onChange={(e) => setProofNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmPay(null)}>Cancel</Button>
            <Button
              disabled={confirmMut.isPending}
              onClick={() => confirmPay && confirmMut.mutate({
                paymentId: confirmPay.id,
                proof_url: proofUrl || undefined,
                note: proofNote || undefined,
              })}
            >
              {confirmMut.isPending ? "Saving…" : "Confirm & Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}