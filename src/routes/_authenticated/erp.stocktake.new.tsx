import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2, ClipboardCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createStocktakeSession } from "@/lib/erp/stocktake/stocktake.functions";

export const Route = createFileRoute("/_authenticated/erp/stocktake/new")({
  head: () => ({ meta: [{ title: "New Stocktake — ERP" }] }),
  component: NewStocktakePage,
});

function NewStocktakePage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const navigate = useNavigate();

  const [name, setName] = useState(`Stocktake ${new Date().toISOString().slice(0, 10)}`);
  const [scope, setScope] = useState<"all_products" | "low_stock" | "empty">("all_products");
  const [includeVariants, setIncludeVariants] = useState(true);
  const [notes, setNotes] = useState("");

  const createFn = useServerFn(createStocktakeSession);
  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          brand_id: brandId!,
          name: name.trim(),
          scope,
          include_variants: includeVariants,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: (r: any) => {
      toast.success("Stocktake created");
      navigate({ to: "/erp/stocktake/$sessionId", params: { sessionId: r.session_id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
  });

  const canSave = !!brandId && name.trim().length > 0 && !mut.isPending;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/erp/stocktake"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" /> New Stocktake
          </h1>
          <p className="text-sm text-muted-foreground">{effectiveBrand?.name ?? "—"}</p>
        </div>
      </div>

      {picker}
      {!brandId ? null : (
        <Card className="p-5 space-y-4">
          <div>
            <Label>Session Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_products">All Active Products</SelectItem>
                  <SelectItem value="low_stock">Low-Stock Items Only</SelectItem>
                  <SelectItem value="empty">Empty (add items manually)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {scope === "all_products" && "Loads every active product into the count sheet."}
                {scope === "low_stock" && "Only items at or below their reorder point."}
                {scope === "empty" && "Starts blank — add items one-by-one inside the session."}
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={includeVariants} onCheckedChange={setIncludeVariants} disabled={scope === "empty"} />
                <Label>Count variants separately</Label>
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for this stocktake." />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mut.mutate()} disabled={!canSave}>
              {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Create & Open Sheet
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
