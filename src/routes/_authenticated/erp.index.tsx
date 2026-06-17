import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Package, Wallet, AlertCircle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand, type Brand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/erp/")({
  head: () => ({ meta: [{ title: "Dashboard — ERP" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const enabled = brandIds.length > 0;

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", brandIds.join(",")],
    enabled,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const [todayOrders, pendingOrders, deliveredOrders, monthRevenue, lowStock, accounts] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).in("brand_id", brandIds).gte("created_at", todayStart.toISOString()),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("brand_id", brandIds).in("status", ["new", "confirmed", "packaging", "packed", "ready_to_ship"]),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("brand_id", brandIds).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        supabase.from("orders").select("total").in("brand_id", brandIds).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }).in("brand_id", brandIds).eq("is_resolved", false),
        supabase.from("erp_accounts").select("current_balance").in("brand_id", brandIds).eq("is_active", true),
      ]);

      const revenue = (monthRevenue.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const cashTotal = (accounts.data ?? []).reduce((s, r) => s + Number(r.current_balance ?? 0), 0);

      return {
        todayOrders: todayOrders.count ?? 0,
        pendingOrders: pendingOrders.count ?? 0,
        deliveredThisMonth: deliveredOrders.count ?? 0,
        revenueThisMonth: revenue,
        lowStock: lowStock.count ?? 0,
        cashTotal,
      };
    },
  });

  const cards = [
    { label: "Today's Orders", value: stats?.todayOrders ?? 0, icon: ShoppingCart, accent: "text-blue-600" },
    { label: "Pending Orders", value: stats?.pendingOrders ?? 0, icon: AlertCircle, accent: "text-amber-600" },
    { label: "Delivered (Month)", value: stats?.deliveredThisMonth ?? 0, icon: TrendingUp, accent: "text-emerald-600" },
    { label: "Revenue (Month)", value: `৳ ${(stats?.revenueThisMonth ?? 0).toLocaleString()}`, icon: Wallet, accent: "text-emerald-600" },
    { label: "Cash & Bank", value: `৳ ${(stats?.cashTotal ?? 0).toLocaleString()}`, icon: Wallet, accent: "text-indigo-600" },
    { label: "Low Stock Alerts", value: stats?.lowStock ?? 0, icon: Package, accent: "text-red-600" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {isAllBrands ? `Showing data for all brands (${brands.length})` : activeBrand ? `Showing data for ${activeBrand.name}` : "Loading brand..."}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.accent}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-7 w-20" /> : <div className="text-2xl font-bold">{c.value}</div>}
            </CardContent>
          </Card>
        ))}
      </section>

      {isAllBrands && brands.length > 1 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Brand Performance</h2>
            <p className="text-xs text-muted-foreground">Per-brand snapshot for today &amp; this month</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brands.map((b) => (
              <BrandPerformanceCard key={b.id} brand={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BrandPerformanceCard({ brand }: { brand: Brand }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-brand-stats", brand.id],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [todayOrders, pending, delivered, monthRev, lowStock] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).gte("created_at", todayStart.toISOString()),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).in("status", ["new", "confirmed", "packaging", "packed", "ready_to_ship"]),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        supabase.from("orders").select("total").eq("brand_id", brand.id).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("is_resolved", false),
      ]);
      const revenue = (monthRev.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      return {
        todayOrders: todayOrders.count ?? 0,
        pending: pending.count ?? 0,
        delivered: delivered.count ?? 0,
        revenue,
        lowStock: lowStock.count ?? 0,
      };
    },
  });
  const items: { label: string; value: string | number; accent: string }[] = [
    { label: "Today", value: data?.todayOrders ?? 0, accent: "text-blue-600" },
    { label: "Pending", value: data?.pending ?? 0, accent: "text-amber-600" },
    { label: "Delivered (M)", value: data?.delivered ?? 0, accent: "text-emerald-600" },
    { label: "Revenue (M)", value: `৳ ${(data?.revenue ?? 0).toLocaleString()}`, accent: "text-emerald-700" },
    { label: "Low Stock", value: data?.lowStock ?? 0, accent: "text-red-600" },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {brand.logo_url && <img src={brand.logo_url} alt="" className="h-6 w-6 rounded object-cover" />}
          {brand.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {items.map((it) => (
            <div key={it.label} className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
              {isLoading ? <Skeleton className="h-6 w-16" /> : (
                <div className={`text-lg font-bold ${it.accent}`}>{it.value}</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}