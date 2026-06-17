import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, Server, User, Shield, Building2, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import { runDiagnostics, refreshCrmMaterializedView } from "@/lib/erp/diagnostics.functions";

export const Route = createFileRoute("/_authenticated/erp/diagnostics")({
  head: () => ({ meta: [{ title: "Diagnostics — ERP" }] }),
  component: DiagnosticsPage,
});

function Row({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium flex items-center gap-1.5 text-right break-all">
        {ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
        {ok === false && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
        {value}
      </span>
    </div>
  );
}

function DiagnosticsPage() {
  const qc = useQueryClient();
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const runFn = useServerFn(runDiagnostics);
  const refreshFn = useServerFn(refreshCrmMaterializedView);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["erp-diagnostics"],
    queryFn: () => runFn({ data: {} } as any),
  });

  const refreshMv = useMutation({
    mutationFn: () => refreshFn({ data: {} } as any),
    onSuccess: () => {
      toast.success("Materialized view refreshed");
      qc.invalidateQueries({ queryKey: ["erp-diagnostics"] });
      qc.invalidateQueries({ queryKey: ["crm-list"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Production Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Vercel/Lovable production environment health check. No secrets are exposed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Re-run
          </Button>
          <Button size="sm" onClick={() => refreshMv.mutate()} disabled={refreshMv.isPending}>
            <Database className="h-4 w-4 mr-1.5" />
            {refreshMv.isPending ? "Refreshing…" : "Refresh CRM cache"}
          </Button>
        </div>
      </div>

      {isLoading && <Card><CardContent className="p-6 text-sm text-muted-foreground">Running checks…</CardContent></Card>}

      {error && (
        <Card className="border-red-300">
          <CardContent className="p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              <div className="font-semibold">Diagnostics call failed</div>
              <div className="font-mono text-xs mt-1">{(error as any)?.message ?? String(error)}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                Likely cause: server env missing (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY) on this deployment, or auth bearer not attached.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Server className="h-4 w-4" /> Server Environment</CardTitle></CardHeader>
            <CardContent>
              <Row label="Supabase URL host" value={data.server.supabaseUrlHost ?? "—"} ok={!!data.server.supabaseUrlHost} />
              <Row label="SUPABASE_PUBLISHABLE_KEY" value={data.server.hasPublishableKey ? "set" : "missing"} ok={data.server.hasPublishableKey} />
              <Row label="SUPABASE_SERVICE_ROLE_KEY" value={data.server.hasServiceRoleKey ? "set" : "missing"} ok={data.server.hasServiceRoleKey} />
              <Row label="NODE_ENV" value={data.server.nodeEnv ?? "—"} />
              <Row label="Runtime" value={data.server.runtime} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> User</CardTitle></CardHeader>
            <CardContent>
              <Row label="User ID" value={<code className="text-xs">{data.user.userId}</code>} ok={true} />
              <Row label="Email" value={data.user.email ?? "—"} />
              <Row label="Roles" value={
                data.roles.length
                  ? <span className="flex flex-wrap gap-1 justify-end">{data.roles.map(r => <Badge key={r} variant="secondary">{r}</Badge>)}</span>
                  : "no roles"
              } ok={data.roles.includes("admin")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Brand Scope</CardTitle></CardHeader>
            <CardContent>
              <Row label="Active brand" value={isAllBrands ? "All brands" : activeBrand?.name ?? "—"} />
              <Row label="Brand IDs in scope" value={brandIds.length} />
              <Row label="Brands visible (from API)" value={data.brands.length} ok={data.brands.length > 0} />
              <div className="mt-2 flex flex-wrap gap-1">
                {data.brands.map(b => (
                  <Badge key={b.id} variant={b.is_active ? "default" : "outline"}>{b.name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> CRM Access</CardTitle></CardHeader>
            <CardContent>
              <Row label="Can read CRM" value={data.crm.canRead ? "yes" : "no"} ok={data.crm.canRead} />
              <Row label="Materialized view rows" value={data.crm.materializedViewCount ?? "—"} ok={data.crm.materializedViewCount != null} />
              {data.crm.materializedViewError && <Row label="MV error" value={<span className="text-red-600 text-xs">{data.crm.materializedViewError}</span>} ok={false} />}
              {data.crm.liveViewError && <Row label="Live view error" value={<span className="text-red-600 text-xs">{data.crm.liveViewError}</span>} ok={false} />}
              {data.crm.error && <Row label="Error" value={<span className="text-red-600 text-xs">{data.crm.error}</span>} ok={false} />}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Vercel deployment checklist</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="text-muted-foreground">Vercel Project → Settings → Environment Variables — Production + Preview both e set thakte hobe:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><code>VITE_SUPABASE_URL</code> = https://bgsspipkjeuceftuatue.supabase.co</li>
            <li><code>VITE_SUPABASE_PUBLISHABLE_KEY</code> = anon key (publishable)</li>
            <li><code>SUPABASE_URL</code> = same URL (server-side)</li>
            <li><code>SUPABASE_PUBLISHABLE_KEY</code> = same anon key (server-side)</li>
            <li><code>SUPABASE_SERVICE_ROLE_KEY</code> = service role key (Supabase Dashboard → Project Settings → API)</li>
          </ul>
          <p className="text-muted-foreground mt-3">Supabase Auth → URL Configuration:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li>Site URL → Vercel production domain</li>
            <li>Additional Redirect URLs → Lovable preview + Vercel preview + production domains (all <code>https://…/**</code>)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}