import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Save, Loader2, Star } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBrand, updateBrand } from "@/lib/erp/settings/brands.functions";
import { saveAppSetting, getAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { useQuery } from "@tanstack/react-query";
import { useCurrentRole } from "@/hooks/use-current-role";

const TIMEZONES = ["Asia/Dhaka", "Asia/Kolkata", "Asia/Dubai", "UTC", "America/New_York"];
const CURRENCIES = ["BDT", "USD", "EUR", "INR", "AED"];
const LANGS = ["en", "bn"];

type EditBrand = {
  id?: string;
  name: string;
  slug: string;
  logo_url: string;
  primary_color: string;
  timezone: string;
  currency: string;
  language: string;
  is_active: boolean;
};

const EMPTY: EditBrand = {
  name: "", slug: "", logo_url: "", primary_color: "#3B82F6",
  timezone: "Asia/Dhaka", currency: "BDT", language: "en", is_active: true,
};

export function BrandsSection() {
  const { brands } = useBrand();
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditBrand>(EMPTY);

  const getFn = useServerFn(getAppSetting);
  const saveFn = useServerFn(saveAppSetting);
  const createFn = useServerFn(createBrand);
  const updateFn = useServerFn(updateBrand);

  const defaultBrandQ = useQuery({
    queryKey: ["app-setting", "default_brand_id"],
    queryFn: () => getFn({ data: { key: "default_brand_id" } }),
  });
  const defaultBrandId = (defaultBrandQ.data?.value as string | null) ?? null;

  const setDefault = useMutation({
    mutationFn: (id: string) => saveFn({ data: { key: "default_brand_id", value: id } }),
    onSuccess: () => {
      toast.success("Default brand updated");
      qc.invalidateQueries({ queryKey: ["app-setting", "default_brand_id"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.id) {
        await updateFn({ data: {
          id: form.id,
          name: form.name,
          slug: form.slug,
          logo_url: form.logo_url || null,
          primary_color: form.primary_color,
          timezone: form.timezone,
          currency: form.currency,
          language: form.language,
          is_active: form.is_active,
        }});
      } else {
        await createFn({ data: {
          name: form.name,
          slug: form.slug,
          logo_url: form.logo_url || null,
          primary_color: form.primary_color,
          timezone: form.timezone,
          currency: form.currency,
          language: form.language,
          is_active: form.is_active,
        }});
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Brand updated" : "Brand created");
      qc.invalidateQueries({ queryKey: ["brands"] });
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(b: typeof brands[number]) {
    const s = (b as any).settings ?? {};
    setForm({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logo_url: b.logo_url ?? "",
      primary_color: s.primary_color ?? "#3B82F6",
      timezone: s.timezone ?? "Asia/Dhaka",
      currency: s.currency ?? "BDT",
      language: s.language ?? "en",
      is_active: b.is_active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Brands</h2>
          <p className="text-xs text-muted-foreground">Add, edit, set defaults. Per-brand timezone & currency.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setForm(EMPTY)}>
                <Plus className="h-4 w-4" /> Add brand
              </Button>
            </DialogTrigger>
            <BrandFormDialog form={form} setForm={setForm} onSave={() => save.mutate()} saving={save.isPending} />
          </Dialog>
        )}
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {brands.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No brands yet.</div>
        )}
        {brands.map((b) => {
          const s = (b as any).settings ?? {};
          const isDefault = b.id === defaultBrandId;
          return (
            <div key={b.id} className="flex items-center gap-4 p-4">
              <div className="h-12 w-12 rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
                {b.logo_url ? (
                  <img src={b.logo_url} alt={b.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs font-bold text-muted-foreground">{b.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{b.name}</span>
                  {isDefault && <Badge variant="secondary" className="text-[10px]"><Star className="h-3 w-3 mr-1" />Default</Badge>}
                  {!b.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  /{b.slug} • {s.currency ?? "BDT"} • {s.timezone ?? "Asia/Dhaka"} • {s.language ?? "en"}
                </div>
              </div>
              {s.primary_color && (
                <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: s.primary_color }} title={s.primary_color} />
              )}
              {isAdmin && (
                <>
                  {!isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setDefault.mutate(b.id)} disabled={setDefault.isPending}>
                      Set default
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => startEdit(b)}>Edit</Button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">View-only. Admin role required to create or edit brands.</p>
      )}
    </div>
  );
}

function BrandFormDialog({
  form, setForm, onSave, saving,
}: {
  form: EditBrand;
  setForm: (f: EditBrand) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof EditBrand>(k: K, v: EditBrand[K]) => setForm({ ...form, [k]: v });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{form.id ? "Edit brand" : "New brand"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="hobbyshop" /></div>
        <div>
          <Label>Primary color</Label>
          <div className="flex gap-2">
            <Input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="w-12 p-1 h-10" />
            <Input value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="flex-1 font-mono text-xs" />
          </div>
        </div>
        <div className="col-span-2"><Label>Logo URL</Label><Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" /></div>
        <div>
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Language</Label>
          <Select value={form.language} onValueChange={(v) => set("language", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{LANGS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} id="brand-active" />
          <Label htmlFor="brand-active">Active</Label>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSave} disabled={saving || !form.name || !form.slug}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {form.id ? "Save changes" : "Create brand"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
