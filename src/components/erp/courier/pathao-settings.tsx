import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, PlugZap, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBrand } from "@/contexts/brand-context";
import {
  pathaoGetSettingsFn,
  pathaoSaveSettingsFn,
  pathaoTestConnectionFn,
} from "@/lib/erp/pathao.functions";

type FormState = {
  base_url: string;
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  store_id: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  base_url: "https://api-hermes.pathao.com",
  client_id: "",
  client_secret: "",
  username: "",
  password: "",
  store_id: "",
  is_active: true,
};

export function PathaoSettings() {
  const qc = useQueryClient();
  const { brands, activeBrand, setActiveBrandId } = useBrand();
  const brandId = activeBrand?.id ?? "";
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showSecrets, setShowSecrets] = useState(false);

  const getFn = useServerFn(pathaoGetSettingsFn);
  const saveFn = useServerFn(pathaoSaveSettingsFn);
  const testFn = useServerFn(pathaoTestConnectionFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pathao-settings", brandId],
    enabled: !!brandId,
    queryFn: () => getFn({ data: { brandId } }),
  });

  useEffect(() => {
    const s = data?.settings;
    setForm(
      s
        ? {
            base_url: s.base_url ?? EMPTY.base_url,
            client_id: s.client_id ?? "",
            client_secret: s.client_secret ?? "",
            username: s.username ?? "",
            password: s.password ?? "",
            store_id: s.store_id ?? "",
            is_active: !!s.is_active,
          }
        : EMPTY,
    );
  }, [data?.settings, brandId]);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: { brand_id: brandId, ...form },
      }),
    onSuccess: () => {
      toast.success("Pathao credentials saved");
      qc.invalidateQueries({ queryKey: ["pathao-settings", brandId] });
      qc.invalidateQueries({ queryKey: ["pathao-cities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => testFn({ data: { brandId } }),
    onSuccess: (r) => toast.success(`Connected. ${r.cityCount} cities loaded.`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4" /> Pathao integration</CardTitle>
        <CardDescription>
          Credentials are stored per brand. Find them in the Pathao Merchant Portal → API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label className="text-xs">Brand</Label>
            <Select value={brandId} onValueChange={setActiveBrandId}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            <Label className="text-sm">Active</Label>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSecrets((s) => !s)}>
              {showSecrets ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
              {showSecrets ? "Hide" : "Show"} secrets
            </Button>
          </div>
        </div>

        {error ? <Alert variant="destructive"><AlertDescription>{(error as Error).message}</AlertDescription></Alert> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Base URL" hint="Use sandbox URL for testing">
            <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api-hermes.pathao.com" />
          </Field>
          <Field label="Store ID">
            <Input value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} placeholder="e.g. 131516" />
          </Field>
          <Field label="Client ID">
            <Input value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
          </Field>
          <Field label="Client Secret">
            <Input type={showSecrets ? "text" : "password"} value={form.client_secret} onChange={(e) => setForm({ ...form, client_secret: e.target.value })} />
          </Field>
          <Field label="Merchant Username (email)">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Merchant Password">
            <Input type={showSecrets ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={
              !brandId ||
              save.isPending ||
              !form.client_id || !form.client_secret || !form.username || !form.password || !form.store_id
            }
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={!brandId || test.isPending || isLoading}
          >
            {test.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <PlugZap className="h-3.5 w-3.5 mr-1" />}
            Test connection
          </Button>
          <p className="text-xs text-muted-foreground">
            Sandbox: <code>https://courier-api-sandbox.pathao.com</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}