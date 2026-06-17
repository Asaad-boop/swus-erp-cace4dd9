import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, Webhook, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentRole } from "@/hooks/use-current-role";
import { MaskedSecretInput } from "@/components/erp/settings/masked-secret-input";
import { getAppSetting, saveAppSetting } from "@/lib/erp/settings/app-settings.functions";

type GeminiCfg = { api_key: string; model: "gemini-pro" | "gemini-flash" | "gemini-1.5-flash"; address_parsing: boolean };
type WebhookCfg = { secret: string };

const GEMINI_DEFAULTS: GeminiCfg = { api_key: "", model: "gemini-1.5-flash", address_parsing: true };
const WEBHOOK_DEFAULTS: WebhookCfg = { secret: "" };

function randomSecret() {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function IntegrationsSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();

  const getFn = useServerFn(getAppSetting);
  const saveFn = useServerFn(saveAppSetting);

  // --------- Gemini AI ----------
  const geminiKey = "integration:gemini";
  const geminiQ = useQuery({ queryKey: ["app-setting", geminiKey], queryFn: () => getFn({ data: { key: geminiKey } }) });
  const [gemini, setGemini] = useState<GeminiCfg>(GEMINI_DEFAULTS);
  useEffect(() => { if (geminiQ.data?.value) setGemini({ ...GEMINI_DEFAULTS, ...(geminiQ.data.value as Partial<GeminiCfg>) }); }, [geminiQ.data]);

  // --------- Webhook ----------
  const webhookKey = `integration:webhook:${brandId}`;
  const webhookQ = useQuery({ queryKey: ["app-setting", webhookKey], queryFn: () => getFn({ data: { key: webhookKey } }) });
  const [webhook, setWebhook] = useState<WebhookCfg>(WEBHOOK_DEFAULTS);
  useEffect(() => { if (webhookQ.data?.value) setWebhook({ ...WEBHOOK_DEFAULTS, ...(webhookQ.data.value as Partial<WebhookCfg>) }); }, [webhookQ.data]);

  const saveAny = useMutation({
    mutationFn: async (payload: { key: string; value: unknown }) => saveFn({ data: payload }),
    onSuccess: (_d, vars) => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["app-setting", vars.key] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/webhooks/${brandId}`
    : "(will be available after deploy)";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-xs text-muted-foreground">Marketing platforms, AI providers, and inbound webhooks.</p>
      </div>

      {/* META ADS - link to marketing module */}
      <Card title="Meta Ads (per brand)" icon={<Link2 className="h-4 w-4" />}>
        <Alert>
          <AlertDescription className="text-xs">
            Meta Ad Accounts (Pixel ID, Access Token, App ID/Secret) are managed in
            <a href="/erp/marketing/accounts" className="text-primary underline ml-1">Marketing → Accounts</a>.
            That page is restricted to admin role (Tier 1 security).
          </AlertDescription>
        </Alert>
      </Card>

      {/* GEMINI */}
      <Card title="Gemini AI" icon={<Sparkles className="h-4 w-4" />}>
        <div className="space-y-3">
          <Field label="API Key">
            <MaskedSecretInput value={gemini.api_key} onChange={(v) => setGemini({ ...gemini, api_key: v })} isAdmin={isAdmin} placeholder="AIza…" />
          </Field>
          <Field label="Model">
            <Select value={gemini.model} onValueChange={(v) => setGemini({ ...gemini, model: v as any })} disabled={!isAdmin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-1.5-flash">gemini-1.5-flash (fast)</SelectItem>
                <SelectItem value="gemini-flash">gemini-flash</SelectItem>
                <SelectItem value="gemini-pro">gemini-pro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Enable AI address parsing</Label>
            <Switch checked={gemini.address_parsing} onCheckedChange={(v) => setGemini({ ...gemini, address_parsing: v })} disabled={!isAdmin} />
          </div>
          {isAdmin && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveAny.mutate({ key: geminiKey, value: gemini })} disabled={saveAny.isPending}>
                <Save className="h-4 w-4" /> Save Gemini
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* LOVABLE AI */}
      <Card title="Lovable AI Gateway" icon={<Sparkles className="h-4 w-4" />}>
        <Alert>
          <AlertDescription className="text-xs">
            <code>LOVABLE_API_KEY</code> is managed automatically by Lovable Cloud — no manual entry needed.
            Rotate it from Project Settings → Secrets.
          </AlertDescription>
        </Alert>
      </Card>

      {/* WEBHOOK */}
      <Card title="Inbound Webhook" icon={<Webhook className="h-4 w-4" />}>
        <div className="space-y-3">
          <Field label="Webhook URL (read-only)">
            <Input readOnly value={webhookUrl} className="font-mono text-xs bg-muted/40" />
          </Field>
          <Field label="Secret for HMAC verification">
            <div className="flex gap-2">
              <div className="flex-1">
                <MaskedSecretInput value={webhook.secret} onChange={(v) => setWebhook({ ...webhook, secret: v })} isAdmin={isAdmin} />
              </div>
              {isAdmin && (
                <Button type="button" variant="outline" size="sm" onClick={() => setWebhook({ ...webhook, secret: randomSecret() })}>
                  Generate
                </Button>
              )}
            </div>
          </Field>
          {isAdmin && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveAny.mutate({ key: webhookKey, value: webhook })} disabled={saveAny.isPending}>
                <Save className="h-4 w-4" /> Save webhook
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold flex items-center gap-2 mb-3">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm font-medium">{label}</Label>{children}</div>;
}
