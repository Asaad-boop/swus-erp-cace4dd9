import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ShoppingCart, Truck, PackageCheck, AlertTriangle, Boxes,
  ClipboardList, Headphones, Users, ArrowRight, RefreshCw, Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Shubho shokal";
  if (h < 17) return "Shubho dupur";
  if (h < 20) return "Shubho bikal";
  return "Shubho rat";
}

export function StaffDashboard() {
  const navigate = useNavigate();
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const { roles } = useCurrentRole();
  const enabled = brandIds.length > 0;

  const { data: me } = useQuery({
    queryKey: ["me-profile-staff"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { name: "there" };
      const { data: p } = await supabase
        .from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return { name: (p?.display_name as string) || u.user.email?.split("@")[0] || "there" };
    },
    staleTime: 5 * 60 * 1000,
  });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["staff-dash", brandIds.join(",")],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [todayOrders, pending, inTransit, attention, lowStock, recent] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .gte("created_at", todayStart.toISOString()),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new", "processing", "confirmed", "packaging", "packed", "ready_to_ship"]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["shipped", "in_transit"]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any])
          .lt("created_at", new Date(Date.now() - 3 * 86400e3).toISOString()),
        applyBrandScope(supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }), brandIds)
          .eq("is_resolved", false),
        applyBrandScope(
          supabase.from("orders").select("id,order_number,status,created_at,customer_name,total"),
          brandIds,
        ).order("created_at", { ascending: false }).limit(8),
      ]);
      return {
        todayOrders: todayOrders.count ?? 0,
        pending: pending.count ?? 0,
        inTransit: inTransit.count ?? 0,
        attention: attention.count ?? 0,
        lowStock: lowStock.count ?? 0,
        recent: (recent.data ?? []) as any[],
      };
    },
  });

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const roleLabel = roles[0]
    ? roles[0].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Staff";

  // Show quick-links tailored to common staff roles; safe fallback for all.
  const has = (r: string) => roles.includes(r as any);
  const quickLinks: { to: string; icon: any; title: string; desc: string; show: boolean }[] = [
    { to: "/erp/orders/web", icon: ShoppingCart, title: "Orders", desc: "Process & confirm",
      show: has("operations") || has("customer_service") || has("warehouse_staff") || has("packer") || roles.length === 0 },
    { to: "/erp/dispatch", icon: PackageCheck, title: "Dispatch", desc: "Pick · pack · label",
      show: has("operations") || has("warehouse_staff") || has("packer") },
    { to: "/erp/courier", icon: Truck, title: "Courier", desc: "Shipments & tracking",
      show: has("operations") || has("customer_service") },
    { to: "/erp/inventory", icon: Boxes, title: "Inventory", desc: "Stock & alerts",
      show: has("operations") || has("warehouse_staff") },
    { to: "/erp/crm", icon: Headphones, title: "CRM", desc: "Customer support",
      show: has("operations") || has("customer_service") },
    { to: "/me", icon: Users, title: "My Workspace", desc: "Attendance · leave · payslips",
      show: true },
  ].filter(l => l.show);

  const kpis = [
    { icon: ShoppingCart, label: "Today's orders", value: data?.todayOrders ?? 0, tone: "indigo", to: "/erp/orders/web" },
    { icon: ClipboardList, label: "Pending action", value: data?.pending ?? 0, tone: "amber", to: "/erp/orders/web" },
    { icon: Truck, label: "In transit", value: data?.inTransit ?? 0, tone: "blue", to: "/erp/courier" },
    { icon: AlertTriangle, label: "Needs attention", value: data?.attention ?? 0, tone: "rose", to: "/erp/orders/web" },
    { icon: Package, label: "Low stock alerts", value: data?.lowStock ?? 0, tone: "violet", to: "/erp/inventory" },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 text-white">
        <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                {greeting()}, {me?.name ?? "..."} <span className="inline-block">👋</span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                {roleLabel} workspace ·{" "}
                {now.toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" })}
                {" · "}
                <span className="text-slate-400">
                  {isAllBrands ? `All Brands (${brands.length})` : activeBrand?.name ?? ""}
                </span>
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-8 max-w-[1400px] mx-auto space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpis.map((c, i) => (
            <button
              key={i}
              onClick={() => navigate({ to: c.to as any })}
              className="group text-left bg-card rounded-xl border p-5 hover:shadow-lg hover:-translate-y-0.5 hover:border-foreground/20 transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
                <span className={cn("rounded-lg p-2", toneBg(c.tone))}>
                  <c.icon className={cn("size-4", toneFg(c.tone))} />
                </span>
              </div>
              {isLoading ? <Skeleton className="h-9 w-20" /> : (
                <div className="text-3xl font-bold tracking-tight tabular-nums leading-none">{c.value}</div>
              )}
            </button>
          ))}
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickLinks.map((q) => (
              <Link
                key={q.to}
                to={q.to as any}
                className="group bg-card border rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 hover:border-foreground/20 transition-all"
              >
                <div className="rounded-lg w-10 h-10 grid place-items-center bg-primary/10 text-primary mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <q.icon className="size-5" />
                </div>
                <div className="font-semibold text-sm">{q.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{q.desc}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent orders */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Recent orders</h3>
            </div>
            <Link to={"/erp/orders/web" as any} className="text-xs text-primary inline-flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (data?.recent ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No recent orders</div>
          ) : (
            <div className="divide-y">
              {data!.recent.map((o: any) => (
                <Link
                  key={o.id}
                  to={"/erp/orders/$orderId" as any}
                  params={{ orderId: o.id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">#{o.order_number ?? o.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground truncate">{o.customer_name ?? "—"}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase">{o.status}</Badge>
                  <div className="text-sm font-mono tabular-nums w-24 text-right">
                    ৳{Math.round(Number(o.total ?? 0)).toLocaleString("en-IN")}
                  </div>
                  <div className="text-xs text-muted-foreground w-20 text-right hidden sm:block">
                    {new Date(o.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function toneBg(t: string) {
  return {
    indigo: "bg-indigo-50 dark:bg-indigo-950/30",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30",
    blue: "bg-blue-50 dark:bg-blue-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    rose: "bg-rose-50 dark:bg-rose-950/30",
    violet: "bg-violet-50 dark:bg-violet-950/30",
  }[t] ?? "bg-muted";
}
function toneFg(t: string) {
  return {
    indigo: "text-indigo-600", emerald: "text-emerald-600", blue: "text-blue-600",
    amber: "text-amber-600", rose: "text-rose-600", violet: "text-violet-600",
  }[t] ?? "text-foreground";
}