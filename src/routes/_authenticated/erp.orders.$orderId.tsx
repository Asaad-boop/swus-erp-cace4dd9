import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft, Printer, Truck, User, Phone, MapPin, Package, MessageSquare,
  Clock, Loader2, MessageCircle, Send, Tag as TagIcon, Activity,
  Globe, CreditCard, FileText, XCircle, Hash,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useOrderDetail } from "@/hooks/erp/use-orders-query";
import { ORDER_STATUSES, customerName, customerPhone, shortId, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { BookPathaoDialog } from "@/components/erp/courier/book-pathao-dialog";
import { BookSteadfastDialog } from "@/components/erp/courier/book-steadfast-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders/$orderId")({
  head: () => ({ meta: [{ title: "Order Details — ERP" }] }),
  component: OrderDetailsPage,
});

const STAT_COLUMNS = [
  { key: "ourRecord", label: "Our Record", dot: "bg-foreground" },
  { key: "overall", label: "Overall", dot: "bg-sky-500" },
  { key: "pathao", label: "Pathao", dot: "bg-rose-500" },
  { key: "redx", label: "RedX", dot: "bg-red-600" },
  { key: "steadfast", label: "Steadfast", dot: "bg-amber-500" },
] as const;

function StatsStrip({ stats }: { stats: Record<string, { total: number; success: number; cancel: number }> }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0">
        {STAT_COLUMNS.map((c) => {
          const s = stats[c.key] ?? { total: 0, success: 0, cancel: 0 };
          return (
            <div key={c.key} className="px-4 py-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{c.label}</span>
              </div>
              <div className="text-2xl font-semibold tabular-nums leading-none">{s.total}</div>
              <div className="flex items-center gap-3 text-[11px] tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">{s.success} success</span>
                <span className="text-rose-600 dark:text-rose-400">{s.cancel} cancel</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({ icon, title, action, children }: {
  icon?: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-muted/30">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          {icon}{title}
        </h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function OrderDetailsPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useOrderDetail(orderId);
  const [note, setNote] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [bookSteadfastOpen, setBookSteadfastOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [tagInput, setTagInput] = useState("");

  const order = data?.order;
  const items = data?.items ?? [];
  const history = data?.history ?? [];
  const notes = data?.notes ?? [];

  // Brand-level courier stats
  const { data: courierStats } = useQuery({
    queryKey: ["courier-stats", order?.brand_id],
    enabled: !!order?.brand_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courier_shipments")
        .select("provider,status")
        .eq("brand_id", order!.brand_id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const acc: Record<string, { total: number; success: number; cancel: number }> = {
      ourRecord: { total: 0, success: 0, cancel: 0 },
      overall: { total: 0, success: 0, cancel: 0 },
      pathao: { total: 0, success: 0, cancel: 0 },
      redx: { total: 0, success: 0, cancel: 0 },
      steadfast: { total: 0, success: 0, cancel: 0 },
    };
    for (const s of courierStats ?? []) {
      const p = (s.provider ?? "").toLowerCase();
      const st = (s.status ?? "").toLowerCase();
      const ok = /deliver|success/.test(st);
      const bad = /cancel|fail|return/.test(st);
      acc.ourRecord.total++; if (ok) acc.ourRecord.success++; if (bad) acc.ourRecord.cancel++;
      acc.overall.total++; if (ok) acc.overall.success++; if (bad) acc.overall.cancel++;
      if (acc[p]) { acc[p].total++; if (ok) acc[p].success++; if (bad) acc[p].cancel++; }
    }
    return acc;
  }, [courierStats]);

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

  const saveMemo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").update({ admin_notes: memo }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memo saved");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTags = useMutation({
    mutationFn: async (tags: string[]) => {
      const { error } = await supabase.from("orders").update({ order_tags: tags }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
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

  const phone = customerPhone(order);
  const tags: string[] = order.order_tags ?? [];
  const fullAddress = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
    .filter(Boolean).join(", ");

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4 print:hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link to="/erp/orders/web"><ArrowLeft className="h-4 w-4 mr-1" />Back to orders</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-lg font-bold font-mono tracking-tight">{shortId(order.id)}</h1>
            <Badge className={statusBadge(order.status).className}>{statusBadge(order.status).label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Invoice</Button>
          <Button size="sm" variant="outline" onClick={() => setBookOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Book Pathao</Button>
          <Button size="sm" variant="outline" onClick={() => setBookSteadfastOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Book Steadfast</Button>
        </div>
      </div>

      {/* Courier stats strip */}
      <StatsStrip stats={stats} />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left / Main */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard
            icon={<User className="h-4 w-4" />}
            title="Customer Information"
            action={
              <div className="flex items-center gap-1">
                {phone && (
                  <>
                    <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                      <a href={`tel:${phone}`} aria-label="Call"><Phone className="h-3.5 w-3.5" /></a>
                    </Button>
                    <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                      <a href={`sms:${phone}`} aria-label="SMS"><MessageSquare className="h-3.5 w-3.5" /></a>
                    </Button>
                    <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                      <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></a>
                    </Button>
                  </>
                )}
              </div>
            }
          >
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Name" value={customerName(order)} />
              <Field label="Mobile" value={phone || "—"} mono />
              {order.alternate_phone && <Field label="Alt phone" value={order.alternate_phone} mono />}
              <Field label="Delivery method" value={order.delivery_method ?? "—"} />
              <Field label="Payment" value={order.payment_method ?? "—"} />
              <Field label="Source" value={order.source ?? "—"} />
              <div className="sm:col-span-2">
                <Field label="Shipping note" value={order.shipping_note ?? order.customer_note ?? "—"} />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<MapPin className="h-4 w-4" />} title="Location">
            <div className="grid sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Field label="City" value={order.shipping_city ?? "—"} />
              <Field label="District" value={order.shipping_district ?? "—"} />
              <Field label="Thana / Zone" value={order.shipping_thana ?? "—"} />
              <div className="sm:col-span-3">
                <Field label="Address" value={order.shipping_address ?? "—"} />
              </div>
              <div className="sm:col-span-3 text-xs text-muted-foreground truncate">
                <span className="mr-1">Full:</span>{fullAddress || "—"}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Package className="h-4 w-4" />}
            title={`Ordered Products (${items.length})`}
          >
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No items</p>
            ) : (
              <div className="divide-y -my-2">
                {items.map((it) => {
                  const price = Number(it.unit_price ?? it.price);
                  const total = Number(it.line_total ?? price * it.quantity);
                  return (
                    <div key={it.id} className="flex items-center gap-3 py-2.5">
                      <div className="h-12 w-12 rounded-md bg-muted shrink-0 overflow-hidden">
                        {it.image
                          ? <img src={it.image} alt="" className="h-full w-full object-cover" />
                          : <div className="h-full w-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{it.name}</div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                          {it.variant_label && <span>{it.variant_label}</span>}
                          <span className="font-mono">SKU: {it.product_id.slice(0, 8)}</span>
                        </div>
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground w-16 text-right">× {it.quantity}</div>
                      <div className="text-sm tabular-nums w-24 text-right">৳ {price.toLocaleString()}</div>
                      <div className="text-sm font-semibold tabular-nums w-28 text-right">৳ {total.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<CreditCard className="h-4 w-4" />} title="Pricing & Payment">
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
              <Row label="Sub Total" value={`৳ ${Number(order.subtotal).toLocaleString()}`} />
              <Row label="Delivery Charge" value={`৳ ${Number(order.shipping_fee).toLocaleString()}`} />
              <Row label="Discount" value={`− ৳ ${Number(order.discount_amount).toLocaleString()}`} muted={Number(order.discount_amount) === 0} />
              <Row label="Advance" value={`৳ ${Number(order.advance_amount ?? 0).toLocaleString()}`} muted={Number(order.advance_amount ?? 0) === 0} />
            </div>
            <Separator className="my-3" />
            <div className="flex items-end justify-between">
              <div className="text-xs text-muted-foreground">Grand Total</div>
              <div className="text-2xl font-bold tabular-nums">৳ {Number(order.total).toLocaleString()}</div>
            </div>
          </SectionCard>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">
          <SectionCard icon={<FileText className="h-4 w-4" />} title="Order Summary">
            <div className="space-y-2 text-sm">
              <Row label="Date" value={format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")} />
              <Row label="Status" value={<Badge className={statusBadge(order.status).className}>{statusBadge(order.status).label}</Badge>} />
              <Row label="Courier" value={order.courier_name ?? "—"} />
              <Row label="Tracking" value={order.tracking_number ?? "—"} mono />
              <Row label="Total" value={<span className="font-bold">৳ {Number(order.total).toLocaleString()}</span>} />
            </div>
            <Separator className="my-3" />
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Change status</Label>
              <Select value={order.status} disabled={updateStatus.isPending} onValueChange={(v) => updateStatus.mutate(v as OrderStatus)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SectionCard>

          <SectionCard icon={<FileText className="h-4 w-4" />} title="Order Memo">
            <Textarea
              rows={3}
              placeholder={order.admin_notes ?? "Add an internal memo…"}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
            <Button size="sm" className="w-full mt-2" disabled={!memo.trim() || saveMemo.isPending} onClick={() => saveMemo.mutate()}>
              Save Memo
            </Button>
          </SectionCard>

          <SectionCard icon={<TagIcon className="h-4 w-4" />} title="Order Tags">
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
              {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => updateTags.mutate(tags.filter((x) => x !== t))}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20"
                  title="Remove tag"
                >
                  {t} <XCircle className="h-3 w-3" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag…"
                className="h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    const next = Array.from(new Set([...tags, tagInput.trim()]));
                    updateTags.mutate(next);
                    setTagInput("");
                  }
                }}
              />
              <Button size="sm" variant="outline" onClick={() => {
                if (!tagInput.trim()) return;
                updateTags.mutate(Array.from(new Set([...tags, tagInput.trim()])));
                setTagInput("");
              }}>Add</Button>
            </div>
          </SectionCard>

          <SectionCard icon={<Send className="h-4 w-4" />} title="Order Actions">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => toast.info("Invoice SMS queued (stub)")}>Invoice SMS</Button>
              <Button size="sm" variant="outline" onClick={() => toast.info("Reminder SMS queued (stub)")}>Reminder SMS</Button>
            </div>
            <Separator className="my-3" />
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Add note</Label>
              <Textarea rows={2} placeholder="Internal note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" className="w-full" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
            </div>
            {notes.length > 0 && (
              <div className="space-y-1.5 mt-3 max-h-44 overflow-y-auto pr-1">
                {notes.map((n) => (
                  <div key={n.id} className="text-[11px] p-2 rounded border bg-muted/30">
                    <div className="text-muted-foreground mb-0.5">{format(new Date(n.created_at), "dd MMM, hh:mm a")}</div>
                    <div>{n.body}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<Globe className="h-4 w-4" />} title="Attribution">
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <Field label="Source" value={order.source ?? "—"} />
              <Field label="Site / Platform" value={order.source_platform ?? order.source_website ?? "—"} />
              <Field label="Facebook Source" value="—" />
              <Field label="Meta Ad Account" value="—" />
              <Field label="Facebook Pixel" value="—" mono />
              <Field label="Entry URL" value="—" mono />
            </div>
          </SectionCard>

          <SectionCard icon={<Activity className="h-4 w-4" />} title="Activity Log">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity yet</p>
            ) : (
              <ol className="relative border-l border-border pl-4 space-y-3 max-h-72 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                    <div className="text-xs">
                      <span className="capitalize text-muted-foreground">{(h.from_status ?? "—").replace(/_/g, " ")}</span>
                      <span className="mx-1">→</span>
                      <span className="font-medium capitalize">{(h.to_status ?? "").replace(/_/g, " ")}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {format(new Date(h.created_at), "dd MMM, hh:mm a")}
                    </div>
                    {h.note && <div className="text-[11px] text-muted-foreground italic mt-0.5">{h.note}</div>}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </aside>
      </div>

      <PrintableInvoice order={order} items={items as never} />
      <BookPathaoDialog open={bookOpen} onOpenChange={setBookOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
      <BookSteadfastDialog open={bookSteadfastOpen} onOpenChange={setBookSteadfastOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">{label}</div>
      <div className={cn("text-sm truncate", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function Row({ label, value, muted, mono }: { label: string; value: React.ReactNode; muted?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-muted-foreground text-xs", muted && "opacity-50")}>{label}</span>
      <span className={cn("tabular-nums truncate", muted && "opacity-50", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("text-xs font-medium", className)}>{children}</div>;
}