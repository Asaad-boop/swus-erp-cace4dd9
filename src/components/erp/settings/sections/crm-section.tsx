import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  listCustomFieldDefs, createCustomFieldDef, updateCustomFieldDef, deleteCustomFieldDef,
} from "@/lib/erp/crm/admin.functions";

const FIELD_TYPES = ["text", "number", "date", "toggle", "select", "url"] as const;

export function CrmCustomFieldsSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const listFn = useServerFn(listCustomFieldDefs);
  const createFn = useServerFn(createCustomFieldDef);
  const updateFn = useServerFn(updateCustomFieldDef);
  const deleteFn = useServerFn(deleteCustomFieldDef);

  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>("text");
  const [options, setOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  const q = useQuery({
    queryKey: ["crm-custom-field-defs", brandId],
    enabled: isAdmin,
    queryFn: () => listFn({ data: { brandId } }),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          brandId,
          label: label.trim(),
          fieldType,
          options: fieldType === "select"
            ? options.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          isRequired,
          sortOrder: (q.data?.length ?? 0) * 10,
        },
      }),
    onSuccess: () => {
      toast.success("Field added");
      setAddOpen(false);
      setLabel(""); setFieldType("text"); setOptions(""); setIsRequired(false);
      qc.invalidateQueries({ queryKey: ["crm-custom-field-defs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Create failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Field deleted");
      qc.invalidateQueries({ queryKey: ["crm-custom-field-defs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const toggleRequired = useMutation({
    mutationFn: (vars: { id: string; isRequired: boolean }) =>
      updateFn({ data: { id: vars.id, patch: { isRequired: vars.isRequired } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-custom-field-defs"] }),
  });

  if (!isAdmin) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Admin only.</CardContent></Card>;
  }

  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">CRM Custom Fields</h2>
          <p className="text-xs text-muted-foreground">
            Per-customer extra fields. Customer detail page e form auto-render hobe.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add field
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : !rows.length ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No custom fields yet. Add one to start collecting structured data.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((f: any) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{f.label}</span>
                      <Badge variant="outline" className="text-[10px]">{f.field_type}</Badge>
                      <span className="text-[11px] text-muted-foreground font-mono truncate">{f.field_key}</span>
                    </div>
                    {f.field_type === "select" && f.options?.values?.length > 0 && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        Options: {(f.options.values as string[]).join(", ")}
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={f.is_required}
                      onCheckedChange={(v) => toggleRequired.mutate({ id: f.id, isRequired: !!v })}
                    />
                    Required
                  </label>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete field "${f.label}"? Existing values stay in JSON.`)) deleteMut.mutate(f.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add custom field</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Preferred size" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={(v: any) => setFieldType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>Options (comma-separated)</Label>
                <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="S, M, L, XL" />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isRequired} onCheckedChange={(v) => setIsRequired(!!v)} />
              Required field
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!label.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {createMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}