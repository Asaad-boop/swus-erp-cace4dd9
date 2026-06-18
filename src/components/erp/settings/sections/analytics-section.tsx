import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, BarChart3, Activity, Facebook, Tag, Database, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentRole } from "@/hooks/use-current-role";
import { getAppSetting, saveAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { supabase } from "@/integrations/supabase/client";

type AnalyticsCfg = {
  ga4_measurement_id: string;
  clarity_project_id: string;
  meta_pixel_id: string;
  gtm_container_id: string;
  enable_ga4: boolean;
  enable_clarity: boolean;
  enable_meta_pixel: boolean;
  enable_gtm: boolean;
  retention_days: number;
  track_admin_traffic: boolean;
};

const DEFAULTS: AnalyticsCfg = {
  ga4_measurement_id: "",
  clarity_project_id: "",
  meta_pixel_id: "",
  gtm_container_id: "",
  enable_ga4: false,
  enable_clarity: false,
  enable_meta_pixel: false,
  enable_gtm: false,
  retention_days: 90,
  track_admin_traffic: false,
};

export function AnalyticsSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const getFn = useServerFn(getAppSetting);
  const saveFn = useServerFn(saveAppSetting);

  const key = `analytics:tracking:${brandId}`;
  const q = useQuery({ queryKey: ["app-setting", key], queryFn: () => getFn({ data: { key } }) });
  const [cfg, setCfg] = useState<AnalyticsCfg>(DEFAULTS);
  useEffect(() => {
    if (q.data?.value) setCfg({ ...DEFAULTS, ...(q.data.value as Partial<AnalyticsCfg>) });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { key, value: cfg } }),
    onSuccess: () => { toast.success("Analytics settings saved"); qc.invalidateQueries({ queryKey: ["app-setting", key] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testing, setTesting] = useState(false);
  const sendTestEvent = async () => {
    setTesting(true);
    try {
      const { error } = await supabase.from("analytics_events").insert({
        event_name: "test_event",
        session_id: `test-${Date.now()}`,
        path: "/erp/settings",
        metadata: { source: "settings_test_button", brand_id: brandId } as any,
      } as any);
      if (error) throw error;
      toast.success("Test event sent — check Live Analytics dashboard");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Analytics & Tracking</h2>
        <p className="text-xs text-muted-foreground">Configure tracking pixels, data retention, and test your setup.</p>
      </div>

      <Card title="Google Analytics 4" icon={<BarChart3 className="h-4 w-4 text-blue-600" />}>
        <Toggle label="Enable GA4 tracking" checked={cfg.enable_ga4} onChange={(v) => setCfg({ ...cfg, enable_ga4: v })} disabled={!isAdmin} />
        <Field label="Measurement ID">
          <Input value={cfg.ga4_measurement_id} onChange={(e) => setCfg({ ...cfg, ga4_measurement_id: e.target.value })}
            placeholder="G-XXXXXXXXXX" disabled={!isAdmin} className="font-mono" />
        </Field>
      </Card>

      <Card title="Microsoft Clarity" icon={<Activity className="h-4 w-4 text-orange-600" />}>
        <Toggle label="Enable Clarity heatmaps" checked={cfg.enable_clarity} onChange={(v) => setCfg({ ...cfg, enable_clarity: v })} disabled={!isAdmin} />
        <Field label="Project ID">
          <Input value={cfg.clarity_project_id} onChange={(e) => setCfg({ ...cfg, clarity_project_id: e.target.value })}
            placeholder="abcd1234ef" disabled={!isAdmin} className="font-mono" />
        </Field>
      </Card>

      <Card title="Meta Pixel" icon={<Facebook className="h-4 w-4 text-blue-700" />}>
        <Toggle label="Enable Meta Pixel" checked={cfg.enable_meta_pixel} onChange={(v) => setCfg({ ...cfg, enable_meta_pixel: v })} disabled={!isAdmin} />
        <Field label="Pixel ID">
          <Input value={cfg.meta_pixel_id} onChange={(e) => setCfg({ ...cfg, meta_pixel_id: e.target.value })}
            placeholder="1234567890123456" disabled={!isAdmin} className="font-mono" />
        </Field>
        <Alert>
          <AlertDescription className="text-xs">
            Server-side Conversions API token lives in <a href="/erp/marketing/accounts" className="text-primary underline">Marketing → Accounts</a>.
          </AlertDescription>
        </Alert>
      </Card>

      <Card title="Google Tag Manager" icon={<Tag className="h-4 w-4 text-emerald-600" />}>
        <Toggle label="Enable GTM" checked={cfg.enable_gtm} onChange={(v) => setCfg({ ...cfg, enable_gtm: v })} disabled={!isAdmin} />
        <Field label="Container ID">
          <Input value={cfg.gtm_container_id} onChange={(e) => setCfg({ ...cfg, gtm_container_id: e.target.value })}
            placeholder="GTM-XXXXXXX" disabled={!isAdmin} className="font-mono" />
        </Field>
      </Card>

      <Card title="Data Retention & Privacy" icon={<Database className="h-4 w-4 text-purple-600" />}>
        <Field label="Event retention (days)">
          <Input type="number" min={7} max={730} value={cfg.retention_days}
            onChange={(e) => setCfg({ ...cfg, retention_days: Math.max(7, Math.min(730, Number(e.target.value) || 90)) })}
            disabled={!isAdmin} />
          <p className="text-[11px] text-muted-foreground mt-1">Events older than this are eligible for cleanup. Min 7, max 730.</p>
        </Field>
        <Toggle label="Track admin/staff traffic" checked={cfg.track_admin_traffic}
          onChange={(v) => setCfg({ ...cfg, track_admin_traffic: v })} disabled={!isAdmin} />
      </Card>

      <Card title="Test Tracking" icon={<FlaskConical className="h-4 w-4 text-pink-600" />}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
            Sends a synthetic <code className="text-[11px]">test_event</code> to verify your pipeline.
            Open Live Analytics to see it arrive in real-time.
          </p>
          <Button size="sm" variant="outline" onClick={sendTestEvent} disabled={testing}>
            <FlaskConical className="h-4 w-4" /> {testing ? "Sending…" : "Send test event"}
          </Button>
        </div>
      </Card>

      {isAdmin && (
        <div className="flex justify-end sticky bottom-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="shadow-lg">
            <Save className="h-4 w-4" /> Save analytics settings
          </Button>
        </div>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm font-medium">{label}</Label>{children}</div>;
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}