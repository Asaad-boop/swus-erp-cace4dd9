import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Users2, Merge } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { findCrmDuplicates, mergeCrmCustomers } from "@/lib/erp/crm/admin.functions";

function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}

export function FindDuplicatesSheet({
  open, onOpenChange, brandId,
}: { open: boolean; onOpenChange: (v: boolean) => void; brandId?: string }) {
  const qc = useQueryClient();
  const findFn = useServerFn(findCrmDuplicates);
  const mergeFn = useServerFn(mergeCrmCustomers);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["crm-duplicates", brandId ?? "all"],
    enabled: open,
    queryFn: () => findFn({ data: { brandId, threshold: 0.8 } }),
    staleTime: 60_000,
  });

  const mergeMut = useMutation({
    mutationFn: (vars: { primaryKey: string; duplicateKeys: string[] }) =>
      mergeFn({ data: vars }),
    onSuccess: (r) => {
      toast.success(`Merged ${r.merged} duplicate(s) into ${r.primaryKey}`);
      qc.invalidateQueries({ queryKey: ["crm-duplicates"] });
      qc.invalidateQueries({ queryKey: ["crm-list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Merge failed"),
  });

  const groups = q.data?.groups ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" /> Find duplicates
          </SheetTitle>
          <SheetDescription>
            Name-similarity ≥ 80%. Primary winner rakhe — onnogula merge hoye jabe (activities, tasks, tags, custom fields).
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {q.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning customers…
            </div>
          ) : !groups.length ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No likely duplicates found. (Scanned {q.data?.totalScanned ?? 0} customers)
            </div>
          ) : (
            groups.map((g: any) => {
              const primary = primaryByGroup[g.id] ?? g.members[0].customer_key;
              const dupes = g.members.filter((m: any) => m.customer_key !== primary).map((m: any) => m.customer_key);
              return (
                <Card key={g.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="secondary" className="text-[10px]">{g.reason}</Badge>
                    <span className="text-muted-foreground">{g.members.length} customers</span>
                  </div>
                  <RadioGroup
                    value={primary}
                    onValueChange={(v) => setPrimaryByGroup((p) => ({ ...p, [g.id]: v }))}
                  >
                    {g.members.map((m: any) => (
                      <Label key={m.customer_key} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40">
                        <RadioGroupItem value={m.customer_key} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{m.name || "Unnamed"}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{m.customer_key}</div>
                        </div>
                        <div className="text-right text-[11px]">
                          <div className="font-semibold tabular-nums">{fmtBdt(m.lifetime_value)}</div>
                          <div className="text-muted-foreground">{m.orders_count} orders</div>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!dupes.length || mergeMut.isPending}
                    onClick={() => mergeMut.mutate({ primaryKey: primary, duplicateKeys: dupes })}
                  >
                    <Merge className="h-4 w-4 mr-1.5" />
                    Merge {dupes.length} into selected primary
                  </Button>
                </Card>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}