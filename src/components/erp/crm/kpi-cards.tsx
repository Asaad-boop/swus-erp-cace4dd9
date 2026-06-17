import { Card, CardContent } from "@/components/ui/card";
import { Users, UserPlus, Activity, Banknote, TrendingUp, ShoppingBag } from "lucide-react";

function formatBdt(n: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
}

type Kpis = {
  totalCustomers: number;
  newThisMonth: number;
  activeLast30: number;
  totalLtv: number;
  avgLtv: number;
  avgAov: number;
};

export function CrmKpiCards({ kpis, loading }: { kpis?: Kpis; loading?: boolean }) {
  const items = [
    { label: "Total customers", value: kpis ? kpis.totalCustomers.toLocaleString() : "—", icon: Users, tone: "text-blue-600 bg-blue-50" },
    { label: "New this month", value: kpis ? kpis.newThisMonth.toLocaleString() : "—", icon: UserPlus, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Active (30d)", value: kpis ? kpis.activeLast30.toLocaleString() : "—", icon: Activity, tone: "text-amber-600 bg-amber-50" },
    { label: "Total LTV", value: kpis ? `৳${formatBdt(kpis.totalLtv)}` : "—", icon: Banknote, tone: "text-indigo-600 bg-indigo-50" },
    { label: "Avg LTV", value: kpis ? `৳${formatBdt(kpis.avgLtv)}` : "—", icon: TrendingUp, tone: "text-fuchsia-600 bg-fuchsia-50" },
    { label: "Avg order value", value: kpis ? `৳${formatBdt(kpis.avgAov)}` : "—", icon: ShoppingBag, tone: "text-rose-600 bg-rose-50" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((it) => (
        <Card key={it.label} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground font-medium">{it.label}</div>
              <div className={`h-7 w-7 rounded-md grid place-items-center ${it.tone}`}>
                <it.icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="text-xl font-bold tracking-tight">{loading ? "…" : it.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}