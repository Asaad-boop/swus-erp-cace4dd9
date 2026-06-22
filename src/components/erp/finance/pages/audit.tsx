import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

type Row = { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; before_data: unknown; after_data: unknown; created_at: string };

export function AuditPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Row | null>(null);

  const q = useQuery({
    queryKey: ["audit_log", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_finance_audit" as never)
        .select("*").eq("brand_id", brandId!).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = (q.data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.action.toLowerCase().includes(s) || r.entity_type.toLowerCase().includes(s) || (r.entity_id ?? "").includes(s);
  });

  const colorFor = (a: string) => a === "create" ? "text-emerald-600" : a === "void" ? "text-amber-600" : a === "delete" ? "text-red-600" : "text-blue-600";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Immutable record of all journal entry changes. Last 500 events.</p>
        </div>
        <div className="min-w-[260px]">
          <Label className="text-xs">Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="action, entity, or id…" />
        </div>
      </header>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>ID</TableHead><TableHead>Actor</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!q.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audit events.</TableCell></TableRow>}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell><span className={`text-xs font-semibold uppercase ${colorFor(r.action)}`}>{r.action}</span></TableCell>
                <TableCell className="text-xs">{r.entity_type}</TableCell>
                <TableCell className="font-mono text-xs">{r.entity_id?.slice(0, 8)}…</TableCell>
                <TableCell className="font-mono text-xs">{r.actor_id?.slice(0, 8) ?? "system"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setPicked(r)}><Eye className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Audit Detail — {picked?.action} {picked?.entity_type}</DialogTitle></DialogHeader>
          {picked && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="font-semibold mb-1 text-muted-foreground">Before</div>
                <pre className="bg-muted/40 p-2 rounded overflow-auto">{picked.before_data ? JSON.stringify(picked.before_data, null, 2) : "—"}</pre>
              </div>
              <div>
                <div className="font-semibold mb-1 text-muted-foreground">After</div>
                <pre className="bg-muted/40 p-2 rounded overflow-auto">{picked.after_data ? JSON.stringify(picked.after_data, null, 2) : "—"}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}