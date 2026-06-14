import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_PATHAO_MAP,
  DEFAULT_STEADFAST_MAP,
  normalizeCourierStatus,
  type CourierProvider,
  type CourierStatusMappingOverrides,
} from "@/lib/erp/courier-status-mapping";
import { ORDER_STATUSES, statusBadge, type OrderStatus } from "@/lib/erp/orders";

type Row = { raw: string; mapped: OrderStatus; source: "default" | "override" };

function buildRows(provider: CourierProvider, overrides: CourierStatusMappingOverrides | null): Row[] {
  const base = provider === "pathao" ? DEFAULT_PATHAO_MAP : DEFAULT_STEADFAST_MAP;
  const ov = overrides?.[provider] ?? {};
  const keys = new Set<string>([...Object.keys(base), ...Object.keys(ov)]);
  return Array.from(keys)
    .sort()
    .map((raw) => ({
      raw,
      mapped: (ov[raw] ?? base[raw]) as OrderStatus,
      source: raw in ov ? "override" : "default",
    }));
}

export function CourierMappingSettings() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["courier-mapping", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_settings")
        .select("config")
        .eq("brand_id", brandId!)
        .maybeSingle();
      if (error) throw error;
      return ((data?.config as any)?.courier_status_mapping ?? null) as CourierStatusMappingOverrides | null;
    },
  });

  const [overrides, setOverrides] = useState<CourierStatusMappingOverrides>({});
  useEffect(() => {
    setOverrides(data ?? {});
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("Brand select korun");
      // Read existing config, merge mapping in.
      const { data: cur } = await supabase
        .from("erp_settings")
        .select("config")
        .eq("brand_id", brandId)
        .maybeSingle();
      const nextConfig = { ...((cur?.config as any) ?? {}), courier_status_mapping: overrides };
      const { error } = await supabase
        .from("erp_settings")
        .upsert({ brand_id: brandId, config: nextConfig }, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mapping save hoyeche");
      qc.invalidateQueries({ queryKey: ["courier-mapping", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!brandId) {
    return <div className="text-sm text-muted-foreground">Top theke ekta brand select korun.</div>;
  }
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Courier Status Mapping</h2>
          <p className="text-sm text-muted-foreground">
            Courier theke ja raw status ashbe, oitar against e amader ERP status set korun. Default mapping built-in, ekhane override korte parben.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save
        </Button>
      </div>

      <Tabs defaultValue="pathao">
        <TabsList>
          <TabsTrigger value="pathao">Pathao</TabsTrigger>
          <TabsTrigger value="steadfast">Steadfast</TabsTrigger>
        </TabsList>
        {(["pathao", "steadfast"] as const).map((provider) => (
          <TabsContent key={provider} value={provider} className="mt-3">
            <ProviderEditor
              provider={provider}
              overrides={overrides}
              setOverrides={setOverrides}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ProviderEditor({
  provider,
  overrides,
  setOverrides,
}: {
  provider: CourierProvider;
  overrides: CourierStatusMappingOverrides;
  setOverrides: React.Dispatch<React.SetStateAction<CourierStatusMappingOverrides>>;
}) {
  const rows = useMemo(() => buildRows(provider, overrides), [provider, overrides]);
  const [newRaw, setNewRaw] = useState("");
  const [newMapped, setNewMapped] = useState<OrderStatus>("delivered");

  const updateRow = (raw: string, mapped: OrderStatus) => {
    setOverrides((prev) => {
      const cur = { ...(prev[provider] ?? {}) };
      const def = provider === "pathao" ? DEFAULT_PATHAO_MAP : DEFAULT_STEADFAST_MAP;
      if (def[raw] === mapped) delete cur[raw];
      else cur[raw] = mapped;
      return { ...prev, [provider]: cur };
    });
  };

  const resetRow = (raw: string) => {
    setOverrides((prev) => {
      const cur = { ...(prev[provider] ?? {}) };
      delete cur[raw];
      return { ...prev, [provider]: cur };
    });
  };

  const deleteCustom = (raw: string) => {
    const def = provider === "pathao" ? DEFAULT_PATHAO_MAP : DEFAULT_STEADFAST_MAP;
    if (raw in def) return; // Can't delete default keys
    resetRow(raw);
  };

  const addRow = () => {
    const key = normalizeCourierStatus(newRaw);
    if (!key) return;
    updateRow(key, newMapped);
    setNewRaw("");
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Courier Raw Status</th>
              <th className="text-left px-3 py-2">→ ERP Status</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const b = statusBadge(row.mapped);
              const def = provider === "pathao" ? DEFAULT_PATHAO_MAP : DEFAULT_STEADFAST_MAP;
              const isCustom = !(row.raw in def);
              return (
                <tr key={row.raw} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.raw}
                    {row.source === "override" && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Custom</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Select value={row.mapped} onValueChange={(v) => updateRow(row.raw, v as OrderStatus)}>
                      <SelectTrigger className="h-8 w-[180px]">
                        <SelectValue>{b.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {statusBadge(s).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.source === "override" && !isCustom && (
                      <Button size="icon" variant="ghost" onClick={() => resetRow(row.raw)} title="Default e firao">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isCustom && (
                      <Button size="icon" variant="ghost" onClick={() => deleteCustom(row.raw)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Custom status add korun
        </Label>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="e.g. customer_unreachable"
            value={newRaw}
            onChange={(e) => setNewRaw(e.target.value)}
            className="h-9 font-mono"
          />
          <Select value={newMapped} onValueChange={(v) => setNewMapped(v as OrderStatus)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue>{statusBadge(newMapped).label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{statusBadge(s).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={addRow} disabled={!newRaw.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}