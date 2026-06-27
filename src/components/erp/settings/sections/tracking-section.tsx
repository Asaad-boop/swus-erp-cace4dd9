import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Save, Send, CheckCircle2, XCircle, AlertTriangle, KeyRound, Facebook,
  Activity, Globe, ExternalLink, ShieldCheck, Loader2, HeartPulse, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  getBrandTrackingConfigs,
  saveBrandTrackingConfig,
  sendCapiTestEvent,
  getCapiRecentLogs,
  getUtmBreakdown,
  getTrackingHealth,
  type TrackingConfig,
} from "@/lib/erp/tracking/meta-capi.functions";
import { cn } from "@/lib/utils";

const EVENT_TYPES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;

function relTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TrackingSection() {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const getFn = useServerFn(getBrandTrackingConfigs);
  const cfgQ = useQuery({ queryKey: ["meta-tracking-configs"], queryFn: () => getFn(), refetchInterval: 30_000 });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Facebook className="h-5 w-5 text-blue-600" /> Meta Pixel & CAPI</h2>
          <p className="text-xs text-muted-foreground">Per-brand Pixel ID, Conversions API token, event toggles, test sender, and live status.</p>
        </div>
      </div>

      {cfgQ.isLoading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading brands…</div>}

      <HealthDashboard />

      <div className="space-y-5">
        {(cfgQ.data ?? []).map((row) => (
          <BrandTrackingCard
            key={row.brand.id}
            brand={row.brand}
            config={row.config}
            status={row.status}
            disabled={!isAdmin}
            onSaved={() => qc.invalidateQueries({ queryKey: ["meta-tracking-configs"] })}
          />
        ))}
      </div>

      <UtmBreakdownCard />
      <RecentLogsCard />
    </div>
  );
}

function BrandTrackingCard({
  brand, config, status, disabled, onSaved,
}: {
  brand: { id: string; name: string; slug: string | null };
  config: TrackingConfig;
  status: { total: number; ok: number; error: number; last_at: string | null; last_event: string | null };
  disabled: boolean;
  onSaved: () => void;
}) {
  const [pixelId, setPixelId] = useState(config.pixel_id ?? "");
  const [tokenName, setTokenName] = useState(config.token_secret_name ?? `META_CAPI_TOKEN_${(brand.slug ?? brand.name).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`);
  const [testCode, setTestCode] = useState(config.test_event_code ?? "");
  const [capiEnabled, setCapiEnabled] = useState(config.capi_enabled);
  const [events, setEvents] = useState<Record<string, boolean>>({ ...config.enabled_events });
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);

  const saveFn = useServerFn(saveBrandTrackingConfig);
  const testFn = useServerFn(sendCapiTestEvent);

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      brand_id: brand.id,
      pixel_id: pixelId,
      capi_enabled: capiEnabled,
      test_event_code: testCode,
      enabled_events: events,
      token_secret_name: tokenName,
      // only send when user typed something; empty input keeps existing
      ...(tokenInput.trim() ? { capi_access_token: tokenInput.trim() } : {}),
    } }),
    onSuccess: () => { toast.success(`${brand.name} tracking saved`); setTokenInput(""); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { brand_id: brand.id } }),
    onSuccess: (r: any) => {
      if (r.ok) toast.success(`✅ Meta received ${r.events_received ?? 1} event · trace ${r.fbtrace_id ?? "—"}`);
      else toast.error(`❌ ${r.error ?? "CAPI rejected"}`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const healthColor =
    !status.last_at ? "bg-gray-400" :
    status.error > 0 && status.error / Math.max(status.total, 1) > 0.3 ? "bg-red-500" :
    Date.now() - new Date(status.last_at).getTime() < 60 * 60 * 1000 ? "bg-emerald-500" : "bg-amber-500";

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", healthColor)} />
          <h3 className="font-semibold truncate">{brand.name}</h3>
          {config.pixel_id && <Badge variant="outline" className="font-mono text-[10px]">PX {config.pixel_id}</Badge>}
          <Badge variant={config.capi_enabled ? "default" : "secondary"} className="text-[10px]">
            CAPI {config.capi_enabled ? "ON" : "OFF"}
          </Badge>
          {config.token_secret_name && (
            <Badge variant={config.token_present ? "default" : "destructive"} className="text-[10px] gap-1">
              <KeyRound className="h-3 w-3" /> {config.token_present ? "token ok" : "token missing"}
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-3 shrink-0">
          <span title="Last 24h"><Activity className="inline h-3 w-3 mr-0.5" />{status.ok}/{status.total} ok</span>
          <span>last: {relTime(status.last_at)}{status.last_event ? ` · ${status.last_event}` : ""}</span>
        </div>
      </div>

      <div className="p-5 grid md:grid-cols-2 gap-5">
        {/* Left: identifiers */}
        <div className="space-y-3">
          <Field label="Meta Pixel ID">
            <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345"
              disabled={disabled} className="font-mono" inputMode="numeric" />
          </Field>
          <Field label="CAPI Access Token">
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={config.token_present ? `•••••••• ${config.token_last4 ?? ""}` : "Paste your Meta CAPI access token"}
                disabled={disabled}
                className="font-mono text-xs"
                autoComplete="off"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowToken((s) => !s)} disabled={disabled}>
                {showToken ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {config.token_present
                ? `Token saved (ends ••${config.token_last4 ?? "??"}). Leave blank to keep, paste a new value to replace.`
                : "Paste your Conversions API access token from Meta Events Manager."}
            </p>
          </Field>
          <Field label="Test Event Code (optional)">
            <Input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345"
              disabled={disabled} className="font-mono" />
          </Field>
        </div>

        {/* Right: toggles */}
        <div className="space-y-3">
          <div className="rounded-md border p-3 flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Server-side CAPI enabled</Label>
              <p className="text-[11px] text-muted-foreground">Master switch. Off = ERP won't fire any CAPI event.</p>
            </div>
            <Switch checked={capiEnabled} onCheckedChange={setCapiEnabled} disabled={disabled} />
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-sm font-medium">Event types</Label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((ev) => (
                <label key={ev} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded border bg-background">
                  <span>{ev}</span>
                  <Switch
                    checked={Boolean(events[ev])}
                    onCheckedChange={(v) => setEvents((s) => ({ ...s, [ev]: v }))}
                    disabled={disabled}
                  />
                </label>
              ))}
            </div>
          </div>

          {config.pixel_id && (
            <a
              href={`https://www.facebook.com/events_manager2/list/pixel/${config.pixel_id}/test_events`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open Events Manager Test Events
            </a>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-muted/20">
        <Button
          variant="outline" size="sm"
          onClick={() => test.mutate()}
          disabled={disabled || test.isPending || !config.pixel_id || !config.token_present}
        >
          {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test event
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={disabled || save.isPending}>
          <Save className="h-4 w-4" /> Save {brand.name}
        </Button>
      </div>
    </section>
  );
}

function UtmBreakdownCard() {
  const fn = useServerFn(getUtmBreakdown);
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["utm-breakdown", days], queryFn: () => fn({ data: { days } }) });
  const captureRate = useMemo(() => {
    if (!q.data || q.data.total_orders === 0) return 0;
    return Math.round((q.data.captured_attribution / q.data.total_orders) * 100);
  }, [q.data]);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <h3 className="font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-emerald-600" /> UTM & Attribution capture</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cn("px-2 py-0.5 rounded text-xs", days === d ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 py-3 grid grid-cols-3 gap-3 text-sm border-b bg-muted/20">
        <Stat label="Orders" value={q.data?.total_orders ?? 0} />
        <Stat label="UTM captured" value={`${captureRate}%`} hint={`${q.data?.captured_attribution ?? 0} orders`} />
        <Stat label="fbclid/fbc" value={q.data?.captured_fbclid ?? 0} hint="for FB Ads match" />
      </div>
      <div className="overflow-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-1.5">Source</th>
              <th className="text-left px-3 py-1.5">Medium</th>
              <th className="text-left px-3 py-1.5">Campaign</th>
              <th className="text-right px-3 py-1.5">Orders</th>
              <th className="text-right px-3 py-1.5">Revenue</th>
              <th className="text-right px-3 py-1.5">fbclid</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.breakdown ?? []).slice(0, 50).map((r, i) => (
              <tr key={i} className="border-b hover:bg-muted/30">
                <td className="px-3 py-1.5 font-medium">{r.utm_source}</td>
                <td className="px-3 py-1.5">{r.utm_medium}</td>
                <td className="px-3 py-1.5 truncate max-w-[200px]">{r.utm_campaign}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.orders}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">৳{Math.round(r.revenue).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.has_fbclid}</td>
              </tr>
            ))}
            {(!q.data || q.data.breakdown.length === 0) && (
              <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No orders in window</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentLogsCard() {
  const fn = useServerFn(getCapiRecentLogs);
  const q = useQuery({
    queryKey: ["capi-logs"],
    queryFn: () => fn({ data: { limit: 30 } }),
    refetchInterval: 15_000,
  });

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-indigo-600" /> Recent CAPI sends</h3>
        <span className="text-[11px] text-muted-foreground">auto-refresh 15s</span>
      </div>
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-1.5">When</th>
              <th className="text-left px-3 py-1.5">Event</th>
              <th className="text-left px-3 py-1.5">Source</th>
              <th className="text-left px-3 py-1.5">Status</th>
              <th className="text-left px-3 py-1.5">Details</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((l: any) => (
              <tr key={l.id} className="border-b">
                <td className="px-3 py-1.5 text-muted-foreground">{relTime(l.created_at)}</td>
                <td className="px-3 py-1.5 font-medium">{l.event_name}</td>
                <td className="px-3 py-1.5">{l.source ?? "—"}</td>
                <td className="px-3 py-1.5">
                  {l.status === "ok"
                    ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> ok</span>
                    : <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" /> error</span>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[420px]">
                  {l.status === "ok"
                    ? `received ${l.events_received ?? 1}${l.fbtrace_id ? ` · ${l.fbtrace_id}` : ""}`
                    : (l.error ?? "—")}
                </td>
              </tr>
            ))}
            {(!q.data || q.data.length === 0) && (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No CAPI sends yet. Try "Send test event".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Alert className="m-3">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-[11px]">
          Tokens are read from runtime secrets by the name you set above. Browser pixel events fire from your website code — this panel only shows server-side CAPI sends.
        </AlertDescription>
      </Alert>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm font-medium">{label}</Label>{children}</div>;
}

function HealthDashboard() {
  const fn = useServerFn(getTrackingHealth);
  const q = useQuery({ queryKey: ["tracking-health"], queryFn: () => fn(), refetchInterval: 30_000 });

  const summary = useMemo(() => {
    const rows = q.data ?? [];
    return {
      healthy: rows.filter((r) => r.verdict === "healthy").length,
      warning: rows.filter((r) => r.verdict === "warning").length,
      down: rows.filter((r) => r.verdict === "down").length,
      total: rows.length,
    };
  }, [q.data]);

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-r from-emerald-500/5 to-blue-500/5">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-rose-600" />
          <h3 className="font-semibold">Daily Health Check</h3>
          <span className="text-[11px] text-muted-foreground">last 24h · auto-refresh 30s</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {summary.healthy} healthy</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {summary.warning} warning</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> {summary.down} down</span>
          <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching} className="h-6 px-2">
            <RefreshCw className={cn("h-3 w-3", q.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {(q.data ?? []).map((row) => <HealthRow key={row.brand.id} row={row} />)}
        {!q.isLoading && (q.data?.length ?? 0) === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">No brands configured.</div>
        )}
        {q.isLoading && <div className="text-center text-sm text-muted-foreground py-8"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</div>}
      </div>
    </section>
  );
}

function HealthRow({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const dot = row.verdict === "healthy" ? "bg-emerald-500" : row.verdict === "warning" ? "bg-amber-500" : "bg-red-500";
  const verdictLabel = row.verdict === "healthy" ? "All systems go" : row.verdict === "warning" ? "Minor issues" : "Needs attention";
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dot)} />
          <span className="font-semibold truncate">{row.brand.name}</span>
          <span className="text-xs text-muted-foreground">{verdictLabel}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span title="Browser pixel events">PX <b className="text-foreground">{row.counts.px_total}</b></span>
          <span title="Server CAPI sends">CAPI <b className="text-foreground">{row.counts.capi_total}</b>{row.counts.capi_errors > 0 && <span className="text-red-600"> ({row.counts.capi_errors} err)</span>}</span>
          <span title="Orders / with UTM">ORD <b className="text-foreground">{row.counts.orders_with_attribution}/{row.counts.orders}</b></span>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4 grid md:grid-cols-2 gap-4 bg-muted/20">
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Checks</div>
            {row.checks.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-background border">
                <div className="flex items-center gap-2 min-w-0">
                  {c.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    : (c.critical ? <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />)}
                  <span className="truncate">{c.label}</span>
                </div>
                {c.detail && <span className="text-muted-foreground tabular-nums shrink-0">{c.detail}</span>}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <EventBreakdown title="Browser pixel events (24h)" data={row.px_by_event} lastAt={row.last_px_at} />
            <EventBreakdown title="Server CAPI sends (24h)" data={row.capi_by_event} errors={row.capi_err_by_event} lastAt={row.last_capi_at} />
          </div>
        </div>
      )}
    </div>
  );
}

function EventBreakdown({ title, data, errors, lastAt }: { title: string; data: Record<string, number>; errors?: Record<string, number>; lastAt: string | null }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded border bg-background p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{title}</div>
        <div className="text-[10px] text-muted-foreground">last: {relTime(lastAt)}</div>
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No events.</div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {entries.map(([ev, n]) => {
            const err = errors?.[ev] ?? 0;
            return (
              <div key={ev} className="flex items-center justify-between text-xs px-2 py-1 rounded border">
                <span className="truncate">{ev}</span>
                <span className="tabular-nums font-medium">
                  {n}{err > 0 && <span className="text-red-600 ml-1">({err}!)</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}