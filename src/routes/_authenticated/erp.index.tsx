import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Package, Wallet, AlertCircle, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/erp/")({
  head: () => ({ meta: [{ title: "Dashboard — ERP" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const [todayOrders, pendingOrders, deliveredOrders, monthRevenue, lowStock, accounts] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brandId!).gte("created_at", todayStart.toISOString()),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brandId!).in("status", ["new", "confirmed", "packaging", "packed", "ready_to_ship"]),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", brandId!).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        supabase.from("orders").select("total").eq("brand_id", brandId!).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }).eq("brand_id", brandId!).eq("is_resolved", false),
        supabase.from("erp_accounts").select("current_balance").eq("brand_id", brandId!).eq("is_active", true),
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
            {activeBrand ? `Showing data for ${activeBrand.name}` : "Loading brand..."}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase 0 — Foundation Ready</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>✅ Multi-brand schema live (Hobby Shop + Playora). Existing orders/products tagged to Hobby Shop.</p>
          <p>✅ ERP tables: accounts, transactions, suppliers, supplier payments, settings, expense categories.</p>
          <p>✅ Auth + role-aware RLS. Brand switcher in top-right.</p>
          <p className="pt-2 text-foreground font-medium">Next phase: full Orders module (list, filters, drawer, manual order creation) — say <em>"phase 1 শুরু কর"</em> to continue.</p>
        </CardContent>
      </Card>
    </div>
  );
}