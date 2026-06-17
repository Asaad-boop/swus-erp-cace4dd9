import { useQuery } from "@tanstack/react-query";
import { Download, Database, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { toast } from "sonner";

async function exportCsv(filename: string, rows: any[]) {
  if (!rows || rows.length === 0) { toast.error("No data to export"); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = r[h];
        if (v == null) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function DataSystemSection({ brandId }: { brandId: string }) {
  const { brands } = useBrand();
  const { isAdmin } = useCurrentRole();
  const brand = brands.find((b) => b.id === brandId);

  const activityQ = useQuery({
    queryKey: ["activity-logs-latest"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, action, created_at, user_id, note, order_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function downloadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("invoice_no, status, payment_method, total, subtotal, shipping_fee, advance_amount, created_at, shipping_name, shipping_phone, shipping_address")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (error) { toast.error(error.message); return; }
    await exportCsv(`orders-${brand?.slug ?? brandId}-${Date.now()}.csv`, data ?? []);
  }
  async function downloadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, price, stock, is_active, created_at")
      .eq("brand_id", brandId)
      .limit(10000);
    if (error) { toast.error(error.message); return; }
    await exportCsv(`products-${brand?.slug ?? brandId}-${Date.now()}.csv`, data ?? []);
  }
  async function downloadFinance() {
    const { data, error } = await supabase
      .from("erp_transactions")
      .select("id, type, amount, currency, description, occurred_at, created_at")
      .eq("brand_id", brandId)
      .order("occurred_at", { ascending: false })
      .limit(10000);
    if (error) { toast.error(error.message); return; }
    await exportCsv(`finance-${brand?.slug ?? brandId}-${Date.now()}.csv`, data ?? []);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Data & System</h2>
        <p className="text-xs text-muted-foreground">Exports, activity log, system info.</p>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Download className="h-4 w-4" />Export data — {brand?.name}</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadOrders}><Download className="h-4 w-4" /> Orders CSV</Button>
          <Button variant="outline" size="sm" onClick={downloadProducts}><Download className="h-4 w-4" /> Products CSV</Button>
          <Button variant="outline" size="sm" onClick={downloadFinance}><Download className="h-4 w-4" /> Finance CSV</Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Up to 10,000 rows per export. Brand-scoped.</p>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><RefreshCw className="h-4 w-4" />Activity log (latest 100)</h3>
        {!isAdmin ? (
          <p className="text-xs text-muted-foreground">Admin only.</p>
        ) : activityQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (activityQ.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded border divide-y text-xs">
            {(activityQ.data ?? []).map((a: any) => (
              <div key={a.id} className="p-2 flex gap-3">
                <Badge variant="outline" className="font-mono shrink-0">{a.action}</Badge>
                <span className="flex-1 truncate text-muted-foreground">{a.note ?? a.order_id}</span>
                <span className="text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Info className="h-4 w-4" />System info</h3>
        <dl className="text-xs grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono">
          <dt className="text-muted-foreground">Supabase project</dt>
          <dd>{import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "—"}</dd>
          <dt className="text-muted-foreground">Build mode</dt>
          <dd>{import.meta.env.MODE}</dd>
          <dt className="text-muted-foreground">Active brand</dt>
          <dd>{brand?.slug ?? "—"}</dd>
          <dt className="text-muted-foreground">Brands available</dt>
          <dd>{brands.length}</dd>
        </dl>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Database className="h-4 w-4" />Cache</h3>
        <Button size="sm" variant="outline" onClick={() => {
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        }}>
          <RefreshCw className="h-4 w-4" /> Reload app
        </Button>
      </section>
    </div>
  );
}
