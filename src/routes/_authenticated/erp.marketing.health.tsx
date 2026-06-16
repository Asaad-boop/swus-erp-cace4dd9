import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldAlert, AlertTriangle, Info, CheckCircle2, Megaphone, Search, Truck, Database, Code2 } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { getHealthChecks } from "@/lib/erp/marketing/health.functions";
import { RangePicker, defaultRange } from "@/components/erp/marketing/range-picker";

export const Route = createFileRoute("/_authenticated/erp/marketing/health")({
  head: () => ({ meta: [{ title: "Marketing Health — ERP" }] }),
  component: HealthPage,
});

const CATEGORY_ICON: Record<string, any> = {
  campaign: Megaphone, attribution: Search, courier: Truck, tracking: Code2, data: Database,
};

function HealthPage() {
  const { activeBrand } = useBrand();
  const fn = useServerFn(getHealthChecks);
  const [range, setRange] = useState(defaultRange(7));

  const q = useQuery({
    queryKey: ["mkt-health", activeBrand?.id, range.from, range.to],
    queryFn: () => fn({ data: { brand_id: activeBrand!.id, ...range } }),
    enabled: !!activeBrand,
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { critical: [], warning: [], info: [] };
    (q.data ?? []).forEach((r: any) => (g[r.severity] ?? g.info).push(r));
    return g;
  }, [q.data]);

  const counts = {
    critical: grouped.critical.length,
    warning: grouped.warning.length,
    info: grouped.info.length,
  };
  const total = counts.critical + counts.warning + counts.info;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link to="/erp/marketing"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <ShieldAlert className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Health & Alerts</h1>
            <p className="text-xs text-muted-foreground">
              Losing campaigns, attribution gaps, courier issues, tracking + data quality.
            </p>
          </div>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CountCard label="Critical" count={counts.critical} tone="critical" />
        <CountCard label="Warning" count={counts.warning} tone="warning" />
        <CountCard label="Info" count={counts.info} tone="info" />
      </div>

      {!activeBrand && <div className="text-sm text-muted-foreground">Select a brand.</div>}
      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {activeBrand && !q.isLoading && total === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
            All clear. Ei range e kono alert nai.
          </CardContent>
        </Card>
      )}

      {(["critical", "warning", "info"] as const).map(
        (sev) => grouped[sev].length > 0 && (
          <Card key={sev}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base capitalize flex items-center gap-2">
                <SevIcon sev={sev} /> {sev} ({grouped[sev].length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {grouped[sev].map((r: any, i: number) => {
                const Icon = CATEGORY_ICON[r.category] ?? Info;
                return (
                  <div key={i} className="flex items-start gap-3 border-b last:border-0 pb-2 last:pb-0">
                    <div className={`mt-0.5 rounded p-1.5 ${sevBg(sev)}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {r.title}
                        <Badge variant="outline" className="text-[10px] capitalize">{r.category}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{r.detail}</div>
                    </div>
                    {r.category === "campaign" && r.ref_id && (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <Link to="/erp/marketing/campaigns/$campaignId" params={{ campaignId: r.ref_id }}>
                          View
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}

function CountCard({ label, count, tone }: { label: string; count: number; tone: "critical" | "warning" | "info" }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`rounded p-2 ${sevBg(tone)}`}><SevIcon sev={tone} /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{count}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SevIcon({ sev }: { sev: string }) {
  if (sev === "critical") return <ShieldAlert className="h-4 w-4 text-destructive" />;
  if (sev === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Info className="h-4 w-4 text-sky-600" />;
}

function sevBg(sev: string) {
  if (sev === "critical") return "bg-red-100 text-red-700";
  if (sev === "warning") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}