import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CodWorkflowMode = "courier" | "direct";

const keyFor = (brandId: string | null) => (brandId ? `finance:cod_workflow_mode:${brandId}` : null);

export function useCodWorkflowMode(brandId: string | null) {
  const qc = useQueryClient();
  const key = keyFor(brandId);

  const query = useQuery({
    queryKey: ["app_setting", key],
    enabled: !!key,
    queryFn: async (): Promise<CodWorkflowMode> => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", key!).maybeSingle();
      if (!data?.value) return "courier";
      try {
        const v = JSON.parse(data.value);
        return v === "direct" ? "direct" : "courier";
      } catch {
        return "courier";
      }
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: CodWorkflowMode) => {
      if (!key) throw new Error("Brand required");
      const { error } = await supabase.from("app_settings").upsert(
        {
          key,
          value: JSON.stringify(next),
          updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_setting", key] });
    },
  });

  return { mode: (query.data ?? "courier") as CodWorkflowMode, isLoading: query.isLoading, setMode: mutation.mutate, isSaving: mutation.isPending };
}
