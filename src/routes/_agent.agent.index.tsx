import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Package, AlertTriangle, Wallet, Truck, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgentDashboard } from "@/lib/erp/imports/agent.functions";
import { PO_STATUS_LABEL, fmtBdt, type ImpPoStatus } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_agent/agent/")({
  head: () => ({ meta: [{ title: "Dashboard — Cargo Agent" }] }),
  component: AgentDashboard,
});

function AgentDashboard() {
  const fn = useServerFn(getAgentDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["agent-dashboard"],
    queryFn: () => fn({ data: {} }),
  });

  const agent = data?.agent;
  const pos = (data?.pos ?? []) as any[];
  const cartons = (data?.cartons ?? []) as any[];

  const kpis = useMemo(() => {
    const totalSpend = pos.reduce((s, p) => s + Number(p.grand_total_bdt || 0), 0);
    const totalPaid = pos.reduce((s, p) => s + Number(p.paid_bdt || 0), 0);
    const totalDue = pos.reduce((s, p) => s + Number(p.due_bdt || 0), 0);
    const inTransitWeight = cartons
      .filter((c) => c.status === "in_transit")
      .reduce((s, c) => s + Number(c.weight_kg || 0), 0);
    return { totalSpend, totalPaid, totalDue, inTransitWeight, poCount: pos.length };
  }, [pos, cartons]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome{agent ? `, ${agent.name}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Aapnar shob purchase order ar carton ekhane.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total POs" value={String(kpis.poCount)} icon={Package} tone="text-slate-600" />
        <Kpi label="In-Transit Weight" value={`${kpis.inTransitWeight.toFixed(1)} kg`} icon={Truck} tone="text-blue-600" />
        <Kpi label="Total Billed" value={fmtBdt(kpis.totalSpend)} icon={Wallet} tone="text-emerald-600" />
        <Kpi label="Outstanding Due" value={fmtBdt(kpis.totalDue)} icon={AlertTriangle} tone="text-orange-600" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Purchase Orders</h2>
          <Link to="/agent/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : pos.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Akhono kono PO nei.</div>
        ) : (
          <div className="space-y-2">
            {pos.slice(0, 8).map((p) => (
              <Link
                key={p.id}
                to="/agent/orders/$orderId"
                params={{ orderId: p.id }}
                className="flex items-center justify-between gap-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/50 px-3 py-2.5 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">PO #{p.id.slice(0, 8)}</span>
                    <Badge variant="secondary" className={PO_STATUS_LABEL[p.status as ImpPoStatus]?.tone}>
                      {PO_STATUS_LABEL[p.status as ImpPoStatus]?.label ?? p.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.order_date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{fmtBdt(p.grand_total_bdt)}</div>
                  <div className="text-[11px] text-muted-foreground">Due {fmtBdt(p.due_bdt)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}