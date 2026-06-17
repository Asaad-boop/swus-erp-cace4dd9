import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/finance/fx")({
  head: () => ({ meta: [{ title: "FX Rates — Finance ERP" }] }),
  component: FxPage,
});

type FX = { id: string; from_ccy: string; to_ccy: string; rate: number; rate_date: string };

function FxPage() {
  const { brandId, effectiveBrand, gate } = useBrandPicker();
  const qc = useQueryClient();
  const [form, setForm] = useState({ from_ccy: "USD", to_ccy: "BDT", rate: "", rate_date: new Date().toISOString().slice(0, 10) });

  const ratesQ = useQuery({
    queryKey: ["fx_rates", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_fx_rates" as never)
        .select("*").eq("brand_id", brandId!).order("rate_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as FX[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("erp_fx_rates" as never).upsert({
        brand_id: brandId, from_ccy: form.from_ccy.toUpperCase(), to_ccy: form.to_ccy.toUpperCase(),
        rate: Number(form.rate), rate_date: form.rate_date,
      } as never, { onConflict: "brand_id,from_ccy,to_ccy,rate_date" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("FX rate saved"); qc.invalidateQueries({ queryKey: ["fx_rates"] }); setForm({ ...form, rate: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">FX Rates</h1>
        <p className="text-sm text-muted-foreground">Currency conversion rates (BDT base). Used for foreign supplier bills & USD revenue.</p>
      </header>

      <div className="rounded-md border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div><Label className="text-xs">From CCY</Label><Input value={form.from_ccy} onChange={(e) => setForm({ ...form, from_ccy: e.target.value })} maxLength={3} className="uppercase" /></div>
          <div><Label className="text-xs">To CCY</Label><Input value={form.to_ccy} onChange={(e) => setForm({ ...form, to_ccy: e.target.value })} maxLength={3} className="uppercase" /></div>
          <div><Label className="text-xs">Rate</Label><Input type="number" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          <div><Label className="text-xs">Date</Label><Input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></div>
          <Button onClick={() => save.mutate()} disabled={!form.rate || save.isPending}>Save Rate</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Rate</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(ratesQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No rates yet.</TableCell></TableRow>}
            {(ratesQ.data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.rate_date}</TableCell>
                <TableCell className="font-mono">{r.from_ccy}</TableCell>
                <TableCell className="font-mono">{r.to_ccy}</TableCell>
                <TableCell className="text-right font-mono">{Number(r.rate).toFixed(4)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm("Delete this rate?")) return;
                    const { error } = await supabase.from("erp_fx_rates" as never).delete().eq("id", r.id);
                    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["fx_rates"] });
                  }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}