import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { getAgentMe } from "@/lib/erp/imports/agent.functions";

export const Route = createFileRoute("/_agent/agent/profile")({
  head: () => ({ meta: [{ title: "Profile — Cargo Agent" }] }),
  component: AgentProfile,
});

function AgentProfile() {
  const fn = useServerFn(getAgentMe);
  const { data: agent, isLoading } = useQuery({ queryKey: ["agent-me"], queryFn: () => fn({ data: undefined as any }) });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!agent) return <div className="p-6">No profile.</div>;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Profile</h1>
      <Card className="p-5 space-y-3">
        <Row label="Name" value={(agent as any).name} />
        <Row label="Phone" value={(agent as any).phone ?? "—"} />
        <Row label="Address" value={(agent as any).address ?? "—"} />
        <Row label="Default shipping rate (BDT/kg)" value={String((agent as any).default_shipping_rate_per_kg_bdt)} />
        <Row label="Default currency" value={(agent as any).default_currency} />
        <Row label="Default FX" value={String((agent as any).default_fx_rate)} />
      </Card>
      <p className="text-xs text-muted-foreground">Profile edit korar jonno importer er sathe jogajog korun.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border last:border-0 pb-2 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}