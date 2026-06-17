import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2, X, Plus, Ban, ShieldCheck, ShoppingBag, MapPin, StickyNote, TagIcon as Tag, Crown } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENT_LABELS, SEGMENT_TONES } from "@/lib/erp/crm/segments";
import {
  getCrmCustomer, addCrmNote, deleteCrmNote, addCrmTag, removeCrmTag, setCrmStatus,
} from "@/lib/erp/crm/crm.functions";

export const Route = createFileRoute("/_authenticated/erp/crm/$customerId")({
  head: () => ({ meta: [{ title: "Customer — CRM" }] }),
  component: CrmCustomerPage,
});

function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const orderStatusTone: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  packaged: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-orange-100 text-orange-700",
  refunded: "bg-zinc-200 text-zinc-700",
};

function CrmCustomerPage() {
  const { customerId } = Route.useParams();
  const qc = useQueryClient();
  const { brands } = useBrand();
  const brandNameById = useMemo(() => new Map(brands.map((b) => [b.id, b.name] as const)), [brands]);

  const getFn = useServerFn(getCrmCustomer);
  const addNoteFn = useServerFn(addCrmNote);
  const delNoteFn = useServerFn(deleteCrmNote);
  const addTagFn = useServerFn(addCrmTag);
  const removeTagFn = useServerFn(removeCrmTag);
  const setStatusFn = useServerFn(setCrmStatus);

  const [note, setNote] = useState("");
  const [newTag, setNewTag] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-customer", customerId],
    queryFn: () => getFn({ data: { customerKey: customerId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-customer", customerId] });
    qc.invalidateQueries({ queryKey: ["crm-list"] });
  };

  const addNoteMut = useMutation({
    mutationFn: () => addNoteFn({ data: { customerKey: customerId, note: note.trim() } }),
    onSuccess: () => { setNote(""); invalidate(); toast.success("Note added"); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const delNoteMut = useMutation({
    mutationFn: (id: string) => delNoteFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Note deleted"); },
  });
  const addTagMut = useMutation({
    mutationFn: () => addTagFn({ data: { customerKey: customerId, tag: newTag.trim() } }),
    onSuccess: () => { setNewTag(""); invalidate(); qc.invalidateQueries({ queryKey: ["crm-tags"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const removeTagMut = useMutation({
    mutationFn: (tag: string) => removeTagFn({ data: { customerKey: customerId, tag } }),
    onSuccess: () => invalidate(),
  });
  const statusMut = useMutation({
    mutationFn: (status: any) => setStatusFn({ data: { customerKey: customerId, status } }),
    onSuccess: () => { invalidate(); toast.success("Status updated"); },
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading customer…</div>;
  }
  if (!data) {
    return <div className="p-6 text-muted-foreground">Customer not found.</div>;
  }

  const s = data.summary;
  const orders = data.orders;
  const addresses = data.addresses;
  const notes = data.notes;
  const brandBreakdown = data.brandBreakdown;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/erp/crm"><ArrowLeft className="h-4 w-4 mr-1" /> All customers</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={s.meta_status ?? "active"} onValueChange={(v) => statusMut.mutate(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start gap-5">
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-bold">
              {(s.name ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">{s.name || "Unnamed customer"}</h1>
                <Badge variant={s.is_registered ? "default" : "secondary"} className="text-[10px]">
                  {s.is_registered ? "Registered" : "Guest"}
                </Badge>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${SEGMENT_TONES[s.segment]}`}>
                  {s.segment === "vip" && <Crown className="h-3 w-3 mr-1" />}
                  {s.segment === "blocked" && <Ban className="h-3 w-3 mr-1" />}
                  {SEGMENT_LABELS[s.segment]}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {s.customer_key}{s.email ? ` · ${s.email}` : ""}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {s.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[11px]">
                    {t}
                    <button onClick={() => removeTagMut.mutate(t)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <div className="inline-flex items-center gap-1">
                  <Input
                    placeholder="Add tag"
                    className="h-7 w-28 text-xs"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newTag.trim()) addTagMut.mutate(); }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!newTag.trim()} onClick={() => addTagMut.mutate()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-[280px]">
              <Stat label="LTV" value={fmtBdt(s.lifetime_value)} tone="text-emerald-600" />
              <Stat label="Orders" value={String(s.orders_count)} />
              <Stat label="Avg AOV" value={fmtBdt(s.avg_order_value)} />
              <Stat label="Brands" value={String(s.brand_ids?.length ?? 0)} />
              <Stat label="First order" value={fmtDate(s.first_order_at)} small />
              <Stat label="Last order" value={fmtDate(s.last_order_at)} small />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview"><ShieldCheck className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="h-4 w-4 mr-1.5" />Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="addresses"><MapPin className="h-4 w-4 mr-1.5" />Addresses ({addresses.length})</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote className="h-4 w-4 mr-1.5" />Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">Brand-wise spend</h3>
              {brandBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {brandBreakdown.sort((a, b) => b.total - a.total).map((bb) => {
                    const pct = s.lifetime_value > 0 ? (bb.total / s.lifetime_value) * 100 : 0;
                    return (
                      <div key={bb.brand_id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium">{brandNameById.get(bb.brand_id) ?? "—"}</span>
                          <span className="text-muted-foreground">{bb.orders} orders · <span className="font-semibold text-foreground">{fmtBdt(bb.total)}</span></span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No orders</TableCell></TableRow>
                  ) : orders.map((o: any) => (
                    <TableRow key={o.id} className="hover:bg-accent/30">
                      <TableCell>
                        <Link to="/erp/orders/$orderId" params={{ orderId: o.id }} className="text-primary hover:underline font-mono text-xs">
                          #{o.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{brandNameById.get(o.brand_id) ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${orderStatusTone[o.status] ?? "bg-muted text-muted-foreground"}`}>
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.payment_method ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDateTime(o.created_at)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(Number(o.total ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card>
            <CardContent className="p-5">
              {addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved addresses.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {addresses.map((a: any) => (
                    <div key={a.id} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{a.label ?? "Address"}</span>
                        {a.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                      </div>
                      <div className="text-sm">{a.full_name}</div>
                      <div className="text-xs text-muted-foreground">{a.phone}</div>
                      <div className="text-sm mt-1">{a.address_line}</div>
                      <div className="text-xs text-muted-foreground">{[a.city, a.district, a.postal_code].filter(Boolean).join(", ")}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  placeholder="Add an internal note about this customer…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button disabled={!note.trim() || addNoteMut.isPending} onClick={() => addNoteMut.mutate()}>
                  {addNoteMut.isPending ? "Adding…" : "Add note"}
                </Button>
              </div>
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : notes.map((n: any) => (
                  <div key={n.id} className="border rounded-md p-3 flex items-start gap-2 group">
                    <div className="flex-1">
                      <div className="text-sm whitespace-pre-wrap">{n.note}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">{fmtDateTime(n.created_at)}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => delNoteMut.mutate(n.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={`${small ? "text-sm" : "text-lg"} font-bold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}