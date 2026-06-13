import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Printer, Truck, User, Phone, MapPin, Package, MessageSquare, Clock, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useOrderDetail, useStaffList } from "@/hooks/erp/use-orders-query";
import { ORDER_STATUSES, customerName, customerPhone, shortId, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { BookPathaoDialog } from "@/components/erp/courier/book-pathao-dialog";
import { BookSteadfastDialog } from "@/components/erp/courier/book-steadfast-dialog";

export const Route = createFileRoute("/_authenticated/erp/orders/$orderId")({
  head: () => ({ meta: [{ title: "Order Details — ERP" }] }),
  component: OrderDetailsPage,
});

function OrderDetailsPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useOrderDetail(orderId);
  const { data: staff = [] } = useStaffList();
  const [note, setNote] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [bookSteadfastOpen, setBookSteadfastOpen] = useState(false);

  const order = data?.order;
  const items = data?.items ?? [];
  const history = data?.history ?? [];
  const notes = data?.notes ?? [];

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: orderId, _new_status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignStaff = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase.from("orders").update({ assigned_to: userId }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assigned");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_order_note", { _order_id: orderId, _body: note, _is_internal: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setNote("");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link to="/erp/orders/web"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold font-mono">#{shortId(order.id)}</h1>
            <p className="text-xs text-muted-foreground">
              {format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")} · Source: {order.source ?? "—"}
            </p>
          </div>
        </div>
        <Badge className={statusBadge(order.status).className}>{statusBadge(order.status).label}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print Invoice</Button>
        <Button size="sm" variant="outline" onClick={() => setBookOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Book Pathao</Button>
        <Button size="sm" variant="outline" onClick={() => setBookSteadfastOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Book Steadfast</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
          <Select value={order.status} disabled={updateStatus.isPending} onValueChange={(v) => updateStatus.mutate(v as OrderStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Assigned to</label>
          <Select
            value={order.assigned_to ?? "none"}
            disabled={assignStaff.isPending}
            onValueChange={(v) => assignStaff.mutate(v === "none" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Unassigned —</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.display_name ?? s.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><User className="h-4 w-4" />Customer</h3>
        <div className="space-y-1 text-sm">
          <div>{customerName(order)}</div>
          <div className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{customerPhone(order)}</div>
          <div className="flex items-start gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{order.shipping_address}, {[order.shipping_thana, order.shipping_city, order.shipping_district].filter(Boolean).join(", ")}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><Package className="h-4 w-4" />Items ({items.length})</h3>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex justify-between gap-3 text-sm border rounded-md p-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{it.name}</div>
                {it.variant_label && <div className="text-xs text-muted-foreground">{it.variant_label}</div>}
                <div className="text-xs text-muted-foreground">Qty: {it.quantity} × ৳ {Number(it.unit_price ?? it.price).toLocaleString()}</div>
              </div>
              <div className="font-semibold whitespace-nowrap">৳ {Number(it.line_total ?? Number(it.price) * it.quantity).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>৳ {Number(order.subtotal).toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>৳ {Number(order.shipping_fee).toLocaleString()}</span></div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− ৳ {Number(order.discount_amount).toLocaleString()}</span></div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total</span><span>৳ {Number(order.total).toLocaleString()}</span></div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><MessageSquare className="h-4 w-4" />Notes</h3>
        <div className="flex gap-2 mb-3">
          <Textarea placeholder="Add internal note…" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add</Button>
        </div>
        {notes.length > 0 ? (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="text-xs p-2 rounded border bg-muted/30">
                <div className="text-muted-foreground mb-0.5">{format(new Date(n.created_at), "dd MMM, hh:mm a")}</div>
                <div>{n.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No notes yet</p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><Clock className="h-4 w-4" />Status Timeline</h3>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="text-xs flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div><span className="capitalize">{(h.from_status ?? "—").replace(/_/g, " ")}</span> → <span className="font-medium capitalize">{(h.to_status ?? "").replace(/_/g, " ")}</span></div>
                  <div className="text-muted-foreground">{format(new Date(h.created_at), "dd MMM, hh:mm a")}</div>
                  {h.note && <div className="text-muted-foreground italic">{h.note}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No status changes recorded yet</p>
        )}
      </section>

      <PrintableInvoice order={order} items={items as never} />
      <BookPathaoDialog open={bookOpen} onOpenChange={setBookOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
      <BookSteadfastDialog open={bookSteadfastOpen} onOpenChange={setBookSteadfastOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
    </div>
  );
}