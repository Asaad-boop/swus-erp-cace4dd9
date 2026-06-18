import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Trash2, X, Plus, Ban, ShieldCheck, ShoppingBag, MapPin, StickyNote,
  Crown, MessageCircle, Phone, Mail, Activity as ActivityIcon, CheckCircle2,
  ListChecks, Settings2, AlertTriangle, Clock, Calendar, Pencil, Save,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { SEGMENT_LABELS, SEGMENT_TONES } from "@/lib/erp/crm/segments";
import {
  getCrmCustomer, addCrmNote, deleteCrmNote, addCrmTag, removeCrmTag, setCrmStatus,
} from "@/lib/erp/crm/crm.functions";
import {
  listCrmActivities, createCrmActivity, updateCrmActivity, deleteCrmActivity,
  listCrmTasks, createCrmTask, completeCrmTask, snoozeCrmTask, deleteCrmTask,
} from "@/lib/erp/crm/engagement.functions";
import {
  listCustomFieldDefs, updateCustomerCustomFields,
} from "@/lib/erp/crm/admin.functions";

export const Route = createFileRoute("/_authenticated/erp/crm/$customerId")({
  head: () => ({ meta: [{ title: "Customer — CRM" }] }),
  component: CrmCustomerPage,
});

/* ============ Utils ============ */
function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function daysAgo(s: string | null | undefined): number | null {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
}
function relTime(s: string | null | undefined): string {
  const d = daysAgo(s);
  if (d === null) return "—";
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}
function waUrl(phone: string, text?: string) {
  const p = phone.replace(/\D/g, "");
  const e164 = p.length === 11 && p.startsWith("01") ? "880" + p.slice(1) : p;
  const t = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${e164}${t}`;
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

const RFM_TONE: Record<string, string> = {
  champion: "bg-emerald-100 text-emerald-800 border-emerald-300",
  loyal: "bg-blue-100 text-blue-800 border-blue-300",
  potential: "bg-indigo-100 text-indigo-800 border-indigo-300",
  new: "bg-cyan-100 text-cyan-800 border-cyan-300",
  at_risk: "bg-amber-100 text-amber-800 border-amber-300",
  cant_lose: "bg-orange-100 text-orange-800 border-orange-300",
  hibernating: "bg-zinc-200 text-zinc-700 border-zinc-300",
  lost: "bg-red-100 text-red-700 border-red-300",
};

const ACTIVITY_ICON: Record<string, any> = {
  note: StickyNote, call: Phone, whatsapp: MessageCircle, email: Mail,
  order: ShoppingBag, tag: ShieldCheck, task: ListChecks, system: ActivityIcon,
};
const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-zinc-100 text-zinc-700",
};

/* ============ Main page ============ */
function CrmCustomerPage() {
  const { customerId } = Route.useParams();
  const qc = useQueryClient();
  const { brands, activeBrandId } = useBrand();
  const brandNameById = useMemo(() => new Map(brands.map((b) => [b.id, b.name] as const)), [brands]);

  const getFn = useServerFn(getCrmCustomer);
  const addTagFn = useServerFn(addCrmTag);
  const removeTagFn = useServerFn(removeCrmTag);
  const setStatusFn = useServerFn(setCrmStatus);

  const [newTag, setNewTag] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-customer", customerId],
    queryFn: () => getFn({ data: { customerKey: customerId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-customer", customerId] });
    qc.invalidateQueries({ queryKey: ["crm-list"] });
  };

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

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading customer…</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Customer not found.</div>;

  const s = data.summary;
  const meta = (data as any).meta ?? {};
  const orders = data.orders;
  const addresses = data.addresses;
  const notes = data.notes;
  const brandBreakdown = data.brandBreakdown;

  const rfmSegment: string | null = meta.rfm_segment ?? null;
  const rfmScore: number | null = meta.rfm_score ?? null;
  const churnScore: number | null = meta.churn_score ?? null;
  const churnRisk: string | null = meta.churn_risk ?? null;
  const recencyDays = daysAgo(s.last_order_at);

  const churnDot =
    churnRisk === "high" ? "bg-red-500" :
    churnRisk === "medium" ? "bg-amber-500" :
    churnRisk === "low" ? "bg-emerald-500" : "bg-zinc-300";

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/erp/crm"><ArrowLeft className="h-4 w-4 mr-1" /> All customers</Link>
        </Button>
        <div className="flex items-center gap-2">
          {s.customer_key && (
            <Button variant="outline" size="sm" asChild>
              <a href={waUrl(s.customer_key)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4 mr-1.5 text-green-600" /> WhatsApp
              </a>
            </Button>
          )}
          {s.customer_key && (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${s.customer_key}`}><Phone className="h-4 w-4 mr-1.5" /> Call</a>
            </Button>
          )}
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
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-bold relative">
              {(s.name ?? "?").slice(0, 1).toUpperCase()}
              <span title={`Churn: ${churnRisk ?? "unknown"}`} className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${churnDot}`} />
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
                {rfmSegment && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${RFM_TONE[rfmSegment] ?? "bg-zinc-100 text-zinc-700 border-zinc-300"}`}>
                    RFM · {rfmSegment.replace(/_/g, " ")}
                    {rfmScore != null && <span className="ml-1 opacity-70">({Number(rfmScore).toFixed(1)})</span>}
                  </span>
                )}
                {recencyDays !== null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px]">
                    <Clock className="h-3 w-3" /> {relTime(s.last_order_at)}
                  </span>
                )}
                {churnRisk === "high" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-[11px]">
                    <AlertTriangle className="h-3 w-3" /> Churn risk {churnScore != null ? `· ${Math.round(churnScore)}` : ""}
                  </span>
                )}
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
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><ShieldCheck className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="activity"><ActivityIcon className="h-4 w-4 mr-1.5" />Activity</TabsTrigger>
          <TabsTrigger value="tasks"><ListChecks className="h-4 w-4 mr-1.5" />Tasks</TabsTrigger>
          <TabsTrigger value="custom"><Settings2 className="h-4 w-4 mr-1.5" />Custom Fields</TabsTrigger>
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

          {(meta.rfm_recency != null || meta.rfm_frequency != null || meta.rfm_monetary != null) && (
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-3">RFM breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Recency (days)" value={meta.rfm_recency != null ? String(meta.rfm_recency) : "—"} />
                  <Stat label="Frequency" value={meta.rfm_frequency != null ? String(meta.rfm_frequency) : "—"} />
                  <Stat label="Monetary" value={meta.rfm_monetary != null ? fmtBdt(Number(meta.rfm_monetary)) : "—"} />
                  <Stat label="Composite" value={rfmScore != null ? Number(rfmScore).toFixed(2) : "—"} />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab customerKey={customerId} brandId={activeBrandId ?? null} customerPhone={s.customer_key} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab customerKey={customerId} brandId={activeBrandId ?? null} />
        </TabsContent>

        <TabsContent value="custom">
          <CustomFieldsTab
            customerKey={customerId}
            brandId={activeBrandId ?? null}
            initial={meta.custom_fields ?? {}}
            onSaved={invalidate}
          />
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
          <NotesTab customerKey={customerId} notes={notes} onChanged={invalidate} />
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

/* ============ Activity Tab ============ */
function ActivityTab({ customerKey, brandId, customerPhone }: { customerKey: string; brandId: string | null; customerPhone: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCrmActivities);
  const createFn = useServerFn(createCrmActivity);
  const updateFn = useServerFn(updateCrmActivity);
  const deleteFn = useServerFn(deleteCrmActivity);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-activities", customerKey],
    queryFn: () => listFn({ data: { customerKey, limit: 50, offset: 0 } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-activities", customerKey] });

  const [dialog, setDialog] = useState<null | "note" | "call" | "whatsapp" | "email">(null);
  const [form, setForm] = useState<{ title: string; body: string; direction: "inbound" | "outbound"; durationSec: string }>({
    title: "", body: "", direction: "outbound", durationSec: "",
  });
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  const openDialog = (t: "note" | "call" | "whatsapp" | "email") => {
    setDialog(t);
    setForm({ title: "", body: "", direction: "outbound", durationSec: "" });
  };

  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        customerKey, brandId,
        type: dialog!, title: form.title || dialog!,
        body: form.body || null,
        direction: (dialog === "call" || dialog === "whatsapp" || dialog === "email") ? form.direction : null,
        durationSec: dialog === "call" && form.durationSec ? Number(form.durationSec) : null,
        whatsappUrl: dialog === "whatsapp" ? waUrl(customerPhone, form.body) : null,
        metadata: {},
      },
    }),
    onSuccess: () => { setDialog(null); invalidate(); toast.success("Logged"); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: (p: { id: string; body: string }) => updateFn({ data: { id: p.id, body: p.body } }),
    onSuccess: () => { setEditing(null); invalidate(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => invalidate(),
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openDialog("note")}><StickyNote className="h-3.5 w-3.5 mr-1.5" />Note</Button>
          <Button size="sm" variant="outline" onClick={() => openDialog("call")}><Phone className="h-3.5 w-3.5 mr-1.5" />Log Call</Button>
          <Button size="sm" variant="outline" onClick={() => openDialog("whatsapp")}><MessageCircle className="h-3.5 w-3.5 mr-1.5 text-green-600" />WhatsApp</Button>
          <Button size="sm" variant="outline" onClick={() => openDialog("email")}><Mail className="h-3.5 w-3.5 mr-1.5" />Email</Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative border-l ml-3 space-y-4 pl-5">
            {data.rows.map((a: any) => {
              const Icon = ACTIVITY_ICON[a.type] ?? ActivityIcon;
              const isEditing = editing?.id === a.id;
              return (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[27px] top-0 h-6 w-6 rounded-full bg-background border grid place-items-center">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="flex items-start justify-between gap-2 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{a.title}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{a.type}</Badge>
                        {a.direction && <Badge variant="secondary" className="text-[10px] capitalize">{a.direction}</Badge>}
                        {a.duration_seconds ? <span className="text-[11px] text-muted-foreground">{Math.round(a.duration_seconds / 60)}m</span> : null}
                      </div>
                      {isEditing ? (
                        <div className="mt-1 flex gap-2 items-start">
                          <Textarea rows={2} value={editing!.body} onChange={(e) => setEditing({ ...editing!, body: e.target.value })} />
                          <Button size="sm" onClick={() => updateMut.mutate({ id: a.id, body: editing!.body })}><Save className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : a.body ? (
                        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.body}</p>
                      ) : null}
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{fmtDateTime(a.created_at)}</span>
                        {a.created_by_name && <><span>·</span><span>{a.created_by_name}</span></>}
                        {a.whatsapp_url && (
                          <a href={a.whatsapp_url} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">Open chat</a>
                        )}
                      </div>
                    </div>
                    {a.type !== "order" && a.type !== "system" && !isEditing && (
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ id: a.id, body: a.body ?? "" })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMut.mutate(a.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">Log {dialog}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={dialog === "call" ? "Outbound call" : dialog === "whatsapp" ? "WhatsApp message" : dialog === "email" ? "Sent email" : "Quick note"} />
            </div>
            {(dialog === "call" || dialog === "whatsapp" || dialog === "email") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Direction</Label>
                  <Select value={form.direction} onValueChange={(v: any) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dialog === "call" && (
                  <div>
                    <Label className="text-xs">Duration (sec)</Label>
                    <Input type="number" min="0" value={form.durationSec} onChange={(e) => setForm({ ...form, durationSec: e.target.value })} />
                  </div>
                )}
              </div>
            )}
            <div>
              <Label className="text-xs">{dialog === "whatsapp" ? "Message" : "Body"}</Label>
              <Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            {dialog === "whatsapp" && customerPhone && (
              <a href={waUrl(customerPhone, form.body)} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> Open WhatsApp with this message
              </a>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============ Tasks Tab ============ */
function TasksTab({ customerKey, brandId }: { customerKey: string; brandId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCrmTasks);
  const createFn = useServerFn(createCrmTask);
  const completeFn = useServerFn(completeCrmTask);
  const snoozeFn = useServerFn(snoozeCrmTask);
  const deleteFn = useServerFn(deleteCrmTask);

  const { data, isLoading } = useQuery({
    queryKey: ["crm-tasks", customerKey],
    queryFn: () => listFn({ data: { customerKey, limit: 100 } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-tasks", customerKey] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", priority: "normal" as const });

  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        customerKey, brandId,
        title: form.title,
        description: form.description || null,
        dueDate: form.dueDate || null,
        priority: form.priority,
      },
    }),
    onSuccess: () => {
      setOpen(false);
      setForm({ title: "", description: "", dueDate: "", priority: "normal" });
      invalidate();
      toast.success("Task created");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const completeMut = useMutation({ mutationFn: (id: string) => completeFn({ data: { id } }), onSuccess: () => invalidate() });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: () => invalidate() });
  const snoozeMut = useMutation({
    mutationFn: (id: string) => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      return snoozeFn({ data: { id, newDueDate: tomorrow } });
    },
    onSuccess: () => { invalidate(); toast.success("Snoozed 1 day"); },
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Tasks</h3>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />New task</Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((t: any) => {
              const overdue = t.due_date && new Date(t.due_date).getTime() < Date.now() && t.status !== "completed";
              return (
                <div key={t.id} className={`border rounded-md p-3 flex items-start gap-3 ${t.status === "completed" ? "opacity-60" : ""}`}>
                  <Checkbox
                    checked={t.status === "completed"}
                    onCheckedChange={() => t.status !== "completed" && completeMut.mutate(t.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${t.status === "completed" ? "line-through" : ""}`}>{t.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_TONE[t.priority] ?? "bg-muted"}`}>{t.priority}</span>
                      {t.status === "snoozed" && <Badge variant="secondary" className="text-[10px]">Snoozed</Badge>}
                      {overdue && <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100">Overdue</Badge>}
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                      {t.due_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDateTime(t.due_date)}</span>}
                      {t.assigned_to_name && <span>· {t.assigned_to_name}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {t.status !== "completed" && (
                      <Button size="sm" variant="ghost" onClick={() => snoozeMut.mutate(t.id)}>Snooze</Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMut.mutate(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Due date</Label>
                <Input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.title.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============ Custom Fields Tab ============ */
function CustomFieldsTab({ customerKey, brandId, initial, onSaved }: { customerKey: string; brandId: string | null; initial: Record<string, any>; onSaved: () => void }) {
  const listDefsFn = useServerFn(listCustomFieldDefs);
  const saveFn = useServerFn(updateCustomerCustomFields);
  const { data: defs, isLoading } = useQuery({
    queryKey: ["crm-cf-defs", brandId ?? "global"],
    queryFn: () => listDefsFn({ data: brandId ? { brandId } : {} }),
  });

  const [values, setValues] = useState<Record<string, any>>(initial ?? {});

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { customerKey, fields: values } }),
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (isLoading) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  const rows = defs ?? [];
  if (!rows.length) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          No custom fields defined yet. Go to Settings → CRM Custom Fields to add some.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {rows.map((d: any) => {
            const k = d.field_key;
            const v = values[k];
            return (
              <div key={d.id}>
                <Label className="text-xs flex items-center gap-1">
                  {d.label}{d.is_required && <span className="text-destructive">*</span>}
                </Label>
                {d.field_type === "text" && (
                  <Input value={v ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                )}
                {d.field_type === "number" && (
                  <Input type="number" value={v ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value === "" ? null : Number(e.target.value) })} />
                )}
                {d.field_type === "date" && (
                  <Input type="date" value={v ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                )}
                {d.field_type === "url" && (
                  <Input type="url" value={v ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                )}
                {d.field_type === "toggle" && (
                  <div className="h-10 flex items-center">
                    <Switch checked={!!v} onCheckedChange={(c) => setValues({ ...values, [k]: c })} />
                  </div>
                )}
                {d.field_type === "select" && (
                  <Select value={v ?? ""} onValueChange={(val) => setValues({ ...values, [k]: val })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {(d.options?.values ?? []).map((opt: string) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {saveMut.isPending ? "Saving…" : "Save fields"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============ Notes Tab ============ */
function NotesTab({ customerKey, notes, onChanged }: { customerKey: string; notes: any[]; onChanged: () => void }) {
  const addFn = useServerFn(addCrmNote);
  const delFn = useServerFn(deleteCrmNote);
  const [note, setNote] = useState("");
  const addMut = useMutation({
    mutationFn: () => addFn({ data: { customerKey, note: note.trim() } }),
    onSuccess: () => { setNote(""); onChanged(); toast.success("Note added"); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { onChanged(); toast.success("Note deleted"); },
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex gap-2">
          <Textarea rows={2} placeholder="Add an internal note about this customer…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button disabled={!note.trim() || addMut.isPending} onClick={() => addMut.mutate()}>
            {addMut.isPending ? "Adding…" : "Add note"}
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
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => delMut.mutate(n.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}