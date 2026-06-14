import { format } from "date-fns";
import { useState } from "react";
import { User, Phone, MapPin, Package, Clock, Loader2, Hash, Calendar, Globe, UserCog, ListChecks, StickyNote, Send } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrderDetail, useStaffList } from "@/hooks/erp/use-orders-query";
import { STATUS_GROUPS, STATUS_BADGE, customerName, customerPhone, invoiceDisplay, statusBadge, type OrderStatus } from "@/lib/erp/orders";

type Props = { orderId: string | null; onClose: () => void; mode?: "web" | "fulfillment" };

const WEB_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "processing", label: "Processing" },
  { value: "incomplete", label: "Incomplete" },
  { value: "good_but_no_response", label: "Good But No Response" },
  { value: "no_response", label: "No Response" },
  { value: "advance_payment", label: "Advance Payment" },
  { value: "on_hold", label: "On Hold" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancel" },
];

export function OrderDrawer({ orderId, onClose, mode = "fulfillment" }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useOrderDetail(orderId);
  const { data: staff = [] } = useStaffList();
  const [note, setNote] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [advAmount, setAdvAmount] = useState("");
  const [advSource, setAdvSource] = useState("");
  const [advNumber, setAdvNumber] = useState("");
  const [advTxnId, setAdvTxnId] = useState("");

  const order = data?.order;
  const items = data?.items ?? [];
  const history = data?.history ?? [];
  const notes = data?.notes ?? [];

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: orderId!, _new_status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateWebStatus = useMutation({
    mutationFn: async ({ web_status, extra }: { web_status: string; extra?: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("orders")
        .update({ web_status: web_status as never, ...(extra ?? {}) })
        .eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickWebStatus = (v: string) => {
    if (v === "advance_payment") {
      setAdvAmount("");
      setAdvSource("");
      setAdvNumber("");
      setAdvTxnId("");
      setAdvOpen(true);
      return;
    }
    updateWebStatus.mutate({ web_status: v });
  };

  const submitAdvance = () => {
    const amt = Number(advAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid advance amount"); return; }
    if (!advSource) { toast.error("Select advance payment source"); return; }
    if (!advNumber || advNumber.length < 4) { toast.error("Enter payment number (min 4 digits)"); return; }
    updateWebStatus.mutate({
      web_status: "advance_payment",
      extra: {
        advance_amount: amt,
        advance_source: advSource,
        advance_payment_number: advNumber,
        advance_txn_id: advTxnId || null,
      },
    });
    setAdvOpen(false);
  };

  const assignStaff = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase.from("orders").update({ assigned_to: userId }).eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assigned");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_order_note", { _order_id: orderId!, _body: note, _is_internal: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setNote("");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-hidden p-0 gap-0 border-border/60">
        {isLoading || !order ? (
          <div className="flex items-center justify-center h-60"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-5 pb-4 bg-gradient-to-r from-primary/10 via-background to-background border-b">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-left">
                  <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Hash className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5">
                    <DialogTitle className="font-mono text-xl tracking-tight">#{invoiceDisplay(order)}</DialogTitle>
                    <DialogDescription className="text-[11px] flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{order.source ?? "—"}</span>
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                    <div className="text-xl font-bold tabular-nums">৳ {Number(order.total).toLocaleString()}</div>
                  </div>
                  <Badge className={statusBadge(order.status).className + " text-xs px-3 py-1 rounded-full"}>{statusBadge(order.status).label}</Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-y-auto max-h-[calc(92vh-90px)] bg-muted/20">
              <div className="grid lg:grid-cols-3 gap-4 p-5">
                {/* LEFT — Customer + Items (2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Customer */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Customer</h3>
                    <div className="space-y-2 text-sm">
                      <div className="text-base font-semibold">{customerName(order)}</div>
                      <a href={`tel:${customerPhone(order)}`} className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium tabular-nums">{customerPhone(order)}</span>
                      </a>
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="leading-relaxed">{order.shipping_address}, {[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}</span>
                      </div>
                    </div>
                  </section>

                  {/* Items */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Items ({items.length})</h3>
                    <div className="space-y-2">
                      {items.map((it) => (
                        <div key={it.id} className="flex justify-between gap-3 text-sm p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{it.name}</div>
                            {it.variant_label && <div className="text-xs text-muted-foreground mt-0.5">{it.variant_label}</div>}
                            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">Qty: <span className="font-semibold text-foreground">{it.quantity}</span> × ৳ {Number(it.unit_price ?? it.price).toLocaleString()}</div>
                          </div>
                          <div className="font-bold whitespace-nowrap tabular-nums">৳ {Number(it.line_total ?? Number(it.price) * it.quantity).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">৳ {Number(order.subtotal).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">৳ {Number(order.shipping_fee).toLocaleString()}</span></div>
                      {Number(order.discount_amount) > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Discount</span><span className="tabular-nums">− ৳ {Number(order.discount_amount).toLocaleString()}</span></div>
                      )}
                      <div className="flex justify-between font-bold text-base pt-2 mt-1 border-t"><span>Total</span><span className="tabular-nums text-primary">৳ {Number(order.total).toLocaleString()}</span></div>
                    </div>
                  </section>

                  {/* Timeline */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Status Timeline</h3>
                    {history.length > 0 ? (
                      <div className="space-y-3 relative before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                        {history.map((h) => (
                          <div key={h.id} className="text-xs flex items-start gap-3 relative">
                            <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-background mt-0.5 shrink-0 z-10" />
                            <div className="flex-1 pb-0.5">
                              <div className="text-sm"><span className="capitalize text-muted-foreground">{(h.from_status ?? "—").replace(/_/g, " ")}</span> <span className="text-muted-foreground/50">→</span> <span className="font-semibold capitalize">{(h.to_status ?? "").replace(/_/g, " ")}</span></div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(h.created_at), "dd MMM, hh:mm a")}</div>
                              {h.note && <div className="text-xs text-muted-foreground italic mt-0.5">"{h.note}"</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No status changes recorded yet</p>
                    )}
                  </section>
                </div>

                {/* RIGHT — Actions + Notes */}
                <div className="space-y-4">
                  {/* Status + Assign */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />Manage</h3>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">Status</label>
                      {mode === "web" ? (
                    <Select
                      value={(order as { web_status?: string | null }).web_status ?? "processing"}
                      disabled={updateWebStatus.isPending}
                      onValueChange={onPickWebStatus}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEB_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={order.status} disabled={updateStatus.isPending} onValueChange={(v) => updateStatus.mutate(v as OrderStatus)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_GROUPS.map((g) => (
                          <div key={g.key}>
                            <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {g.label}
                            </div>
                            {g.statuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_BADGE[s]?.label ?? s.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><UserCog className="h-3 w-3" />Assigned to</label>
                      <Select
                        value={order.assigned_to ?? "none"}
                        disabled={assignStaff.isPending}
                        onValueChange={(v) => assignStaff.mutate(v === "none" ? null : v)}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Unassigned —</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.display_name ?? s.id.slice(0, 8)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </section>

                  {/* Notes */}
                  <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Notes</h3>
                    <div className="space-y-2 mb-3">
                      <Textarea
                        placeholder="Add internal note…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className="resize-none text-sm"
                      />
                      <Button size="sm" className="w-full gap-1.5" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                        <Send className="h-3.5 w-3.5" />Add Note
                      </Button>
                    </div>
                    {notes.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {notes.map((n) => (
                          <div key={n.id} className="p-3 rounded-lg border-l-4 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/30 shadow-sm">
                            <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">{format(new Date(n.created_at), "dd MMM, hh:mm a")}</div>
                            <div className="text-sm font-semibold text-foreground dark:text-amber-50 whitespace-pre-wrap leading-relaxed">{n.body}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic text-center py-3">No notes yet</p>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </>
        )}

        <Dialog open={advOpen} onOpenChange={setAdvOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Advance Payment</DialogTitle>
          <DialogDescription>Customer kotota advance pay korlo, ki diye?</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Advance Amount (৳) <span className="text-rose-600">*</span></Label>
            <Input type="number" min={1} autoFocus value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} placeholder="e.g. 100" />
          </div>
          <div>
            <Label>Payment Source <span className="text-rose-600">*</span></Label>
            <Select value={advSource} onValueChange={setAdvSource}>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bKash">bKash</SelectItem>
                <SelectItem value="Nagad">Nagad</SelectItem>
                <SelectItem value="Rocket">Rocket</SelectItem>
                <SelectItem value="Upay">Upay</SelectItem>
                <SelectItem value="Bank">Bank Transfer</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment Number / Last 4 Digits <span className="text-rose-600">*</span></Label>
            <Input
              inputMode="numeric"
              maxLength={20}
              value={advNumber}
              onChange={(e) => setAdvNumber(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 01712345678 or 5678"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Full number ba last 4 digit — jeta accept koreche.</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Transaction ID <span className="text-muted-foreground/70">(optional)</span></Label>
            <Input maxLength={50} value={advTxnId} onChange={(e) => setAdvTxnId(e.target.value)} placeholder="e.g. 9F7A2BX1Q" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAdvOpen(false)}>Cancel</Button>
          <Button disabled={updateWebStatus.isPending} onClick={submitAdvance} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {updateWebStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}