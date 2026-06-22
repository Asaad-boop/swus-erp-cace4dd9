import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Search, RefreshCw, Users as UsersIcon, Mail, Phone, ShieldCheck,
  ShoppingBag, Calendar, Ban, CheckCircle2, ExternalLink, UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomerAccounts } from "@/lib/erp/users.functions";

export const Route = createFileRoute("/_authenticated/erp/users")({
  head: () => ({ meta: [{ title: "Customer Accounts — ERP" }] }),
  component: CustomerAccountsPage,
});

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);
}

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function CustomerAccountsPage() {
  const [search, setSearch] = useState("");
  const [includeStaff, setIncludeStaff] = useState(false);
  const listFn = useServerFn(listCustomerAccounts);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["customer-accounts", includeStaff],
    queryFn: () => listFn({ data: { includeStaff, pageSize: 200 } }),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((r: any) =>
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.display_name ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const stats = useMemo(() => {
    const all = data?.rows ?? [];
    return {
      total: all.length,
      withOrders: all.filter((r: any) => r.order_count > 0).length,
      revenue: all.reduce((s: number, r: any) => s + (r.total_spent || 0), 0),
      newThisMonth: all.filter((r: any) => {
        if (!r.created_at) return false;
        const d = new Date(r.created_at);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [data]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-primary" />
            Customer Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Website signups — customers who created accounts to shop. Staff management lives in{" "}
            <Link to="/erp/hr/staff" className="text-primary underline underline-offset-2">HR → Staff</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/erp/hr/staff"><UserCog className="h-4 w-4 mr-2" />Manage Staff</Link>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Accounts" value={stats.total} icon={UsersIcon} tone="text-blue-600" />
        <KpiCard label="With Orders" value={stats.withOrders} icon={ShoppingBag} tone="text-emerald-600" />
        <KpiCard label="New This Month" value={stats.newThisMonth} icon={Calendar} tone="text-amber-600" />
        <KpiCard label="Total Revenue" value={formatCurrency(stats.revenue)} icon={ShoppingBag} tone="text-violet-600" />
      </div>

      {/* Controls */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name, or phone…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="includeStaff" checked={includeStaff} onCheckedChange={setIncludeStaff} />
            <Label htmlFor="includeStaff" className="text-sm cursor-pointer">
              Include staff accounts
            </Label>
          </div>
          <Badge variant="secondary">{rows.length} shown</Badge>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-center">Orders</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No customers found.</TableCell></TableRow>
            ) : (
              rows.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-semibold text-primary">
                        {(r.display_name || r.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.display_name || "Unnamed"}</div>
                        {r.is_staff && (
                          <Badge variant="outline" className="mt-0.5 text-[10px] h-4 border-amber-500/50 text-amber-700">
                            <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Staff
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-0.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" />{r.email || "—"}</div>
                      {r.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" />{r.phone}</div>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">{r.order_count || 0}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(r.total_spent || 0)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(r.last_sign_in_at)}</TableCell>
                  <TableCell>
                    {r.banned_until && new Date(r.banned_until) > new Date() ? (
                      <Badge variant="destructive" className="text-[10px]"><Ban className="h-3 w-3 mr-1" />Banned</Badge>
                    ) : r.email_confirmed_at ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Unverified</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/erp/crm/$customerId" params={{ customerId: r.id }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: any; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <Icon className={`h-8 w-8 ${tone} opacity-70`} />
      </div>
    </Card>
  );
}