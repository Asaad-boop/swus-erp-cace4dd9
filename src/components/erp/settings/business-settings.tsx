import { useEffect, useRef, useState } from "react";
import { Loader2, Save, FileText, Upload, Trash2, ImageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type BrandSettings = {
  business_mobile?: string;
  business_address?: string;
  default_delivery_cost?: number;
  hotline?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  bin?: string;
  trade_license?: string;
  footer_thank_you?: string;
};

type FormState = {
  business_name: string;
  business_mobile: string;
  invoice_prefix: string;
  business_address: string;
  default_delivery_cost: string;
  logo_url: string;
  hotline: string;
  whatsapp: string;
  email: string;
  website: string;
  facebook: string;
  instagram: string;
  bin: string;
  trade_license: string;
  footer_thank_you: string;
};

const EMPTY: FormState = {
  business_name: "",
  business_mobile: "",
  invoice_prefix: "",
  business_address: "",
  default_delivery_cost: "0",
  logo_url: "",
  hotline: "",
  whatsapp: "",
  email: "",
  website: "",
  facebook: "",
  instagram: "",
  bin: "",
  trade_license: "",
  footer_thank_you: "",
};

const SLUG_RE = /^[A-Za-z0-9_]+-?$/;

export function BusinessSettings() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["brand-settings", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const [brandRes, settingsRes] = await Promise.all([
        supabase.from("brands").select("id,name,logo_url,settings").eq("id", brandId!).single(),
        supabase.from("erp_settings").select("invoice_prefix,invoice_seq,invoice_pad").eq("brand_id", brandId!).maybeSingle(),
      ]);
      if (brandRes.error) throw brandRes.error;
      const bsettings = (brandRes.data?.settings ?? {}) as BrandSettings;
      return {
        brand: brandRes.data,
        bsettings,
        erp: settingsRes.data,
      };
    },
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!data) return;
    setForm({
      business_name: data.brand?.name ?? "",
      business_mobile: data.bsettings.business_mobile ?? "",
      invoice_prefix: data.erp?.invoice_prefix ?? "INV-",
      business_address: data.bsettings.business_address ?? "",
      default_delivery_cost: String(data.bsettings.default_delivery_cost ?? 0),
      logo_url: data.brand?.logo_url ?? "",
      hotline: data.bsettings.hotline ?? "",
      whatsapp: data.bsettings.whatsapp ?? "",
      email: data.bsettings.email ?? "",
      website: data.bsettings.website ?? "",
      facebook: data.bsettings.facebook ?? "",
      instagram: data.bsettings.instagram ?? "",
      bin: data.bsettings.bin ?? "",
      trade_license: data.bsettings.trade_license ?? "",
      footer_thank_you: data.bsettings.footer_thank_you ?? "",
    });
  }, [data]);

  const slugInvalid = !!form.invoice_prefix && !SLUG_RE.test(form.invoice_prefix);
  const nextPreview = form.invoice_prefix
    ? form.invoice_prefix + String((data?.erp?.invoice_seq ?? 0) + 1).padStart(data?.erp?.invoice_pad ?? 7, "0")
    : "—";

  const save = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No active brand");
      if (slugInvalid) throw new Error("Invalid invoice slug");

      const settingsJson: BrandSettings = {
        ...(data?.bsettings ?? {}),
        business_mobile: form.business_mobile || undefined,
        business_address: form.business_address || undefined,
        default_delivery_cost: Number(form.default_delivery_cost) || 0,
        hotline: form.hotline || undefined,
        whatsapp: form.whatsapp || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        facebook: form.facebook || undefined,
        instagram: form.instagram || undefined,
        bin: form.bin || undefined,
        trade_license: form.trade_license || undefined,
        footer_thank_you: form.footer_thank_you || undefined,
      };

      const { error: brandErr } = await supabase
        .from("brands")
        .update({
          name: form.business_name,
          logo_url: form.logo_url || null,
          settings: settingsJson,
        })
        .eq("id", brandId);
      if (brandErr) throw brandErr;

      const prevPrefix = data?.erp?.invoice_prefix ?? "INV-";
      const newPrefix = form.invoice_prefix || "INV-";

      const { error: erpErr } = await supabase
        .from("erp_settings")
        .upsert({
          brand_id: brandId,
          invoice_prefix: newPrefix,
        }, { onConflict: "brand_id" });
      if (erpErr) throw erpErr;

      let updated = 0;
      if (newPrefix !== prevPrefix) {
        const { data: cnt, error: rpcErr } = await supabase.rpc("reapply_invoice_prefix", { _brand_id: brandId });
        if (rpcErr) throw rpcErr;
        updated = Number(cnt ?? 0);
      }
      return { updated, changed: newPrefix !== prevPrefix };
    },
    onSuccess: (res) => {
      if (res?.changed) {
        toast.success(`Settings saved. ${res.updated} invoice${res.updated === 1 ? "" : "s"} re-prefixed.`);
      } else {
        toast.success("Business settings updated");
      }
      qc.invalidateQueries({ queryKey: ["brand-settings", brandId] });
      qc.invalidateQueries({ queryKey: ["brands"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!brandId) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Select a brand to edit its settings.</div>;
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4 max-w-3xl">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      className="rounded-xl border bg-card shadow-sm max-w-3xl overflow-hidden"
    >
      <header className="px-5 py-3 border-b bg-muted/30">
        <h2 className="font-bold text-base">Business Setting</h2>
      </header>

      <div className="p-5 space-y-5">
        <Field
          label="Business Name"
          hint="This is the name of the business that will be used in the invoice"
        >
          <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} required />
        </Field>

        <Field
          label="Business Mobile"
          hint="This is the mobile number of the business that will be used in the invoice"
        >
          <Input value={form.business_mobile} onChange={(e) => set("business_mobile", e.target.value)} inputMode="tel" />
        </Field>

        <Field
          label="Invoice Slug"
          hint="This slug is added before the invoice number. Use English letters, digits or underscores, with an optional trailing hyphen."
          error={slugInvalid ? "Only A–Z, a–z, 0–9, _ allowed, optional trailing -" : null}
        >
          <Input
            value={form.invoice_prefix}
            onChange={(e) => set("invoice_prefix", e.target.value)}
            placeholder="HBS-"
            className={slugInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Next invoice will be{" "}
            <span className="font-mono font-semibold text-foreground">{nextPreview}</span>
          </div>
        </Field>

        <Field
          label="Business Address"
          hint="This is the address of the business that will be used in the invoice"
        >
          <Textarea value={form.business_address} onChange={(e) => set("business_address", e.target.value)} rows={2} />
        </Field>

        <Field
          label="Default Delivery Cost"
          hint="This default delivery cost will be automatically added in the new order form and you can change it if needed"
        >
          <Input
            type="number"
            min="0"
            step="1"
            value={form.default_delivery_cost}
            onChange={(e) => set("default_delivery_cost", e.target.value)}
          />
        </Field>

        <Field
          label="Business Logo"
          hint="Logo URL displayed on invoices and documents"
        >
          <Input
            value={form.logo_url}
            onChange={(e) => set("logo_url", e.target.value)}
            placeholder="https://..."
          />
          {form.logo_url && (
            <div className="mt-2 rounded-md border p-3 flex items-center justify-center bg-muted/20">
              <img src={form.logo_url} alt="Business logo" className="max-h-20 object-contain" />
            </div>
          )}
        </Field>
      </div>

      <footer className="px-5 py-3 border-t bg-muted/20 flex justify-end">
        <Button type="submit" disabled={save.isPending || slugInvalid}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Update Business
        </Button>
      </footer>
    </form>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive font-medium">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}