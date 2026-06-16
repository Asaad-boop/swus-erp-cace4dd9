import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Database, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing Intelligence — ERP" }] }),
  component: MarketingRebuildPlaceholder,
});

const phases = [
  { n: 1, name: "Database Foundation (11 tables, RLS, indexes)", done: true },
  { n: 2, name: "DB Functions — attribution & profit snapshot RPCs", done: true },
  { n: 3, name: "Meta API Sync (server functions + daily cron)", done: true },
  { n: 4, name: "Website UTM / fbclid / session tracking", done: false },
  { n: 5, name: "Profit Snapshot Engine", done: false },
  { n: 6, name: "Accounting Integration (auto-post Meta spend)", done: false },
  { n: 7, name: "UI Pages (12 routes: Overview, Campaigns, Adsets, Ads, Attribution, ROAS, Product×Campaign, Courier×Campaign, Accounting, Settings)", done: false },
  { n: 8, name: "Polish — health badges, data quality alerts, QA", done: false },
];

function MarketingRebuildPlaceholder() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Full rebuild in progress — purano module sorano hoyeche, notun "real ROAS / POAS / net profit" engine baniye dewa hocche.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Phase 1 Complete — Database Foundation
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="text-muted-foreground">
            ✓ 11 notun marketing table create — RLS, indexes, triggers, seed.<br />
            ✓ Purano 10 ta table <code className="text-xs">_legacy</code> suffix e rename — data 100% safe.<br />
            ✓ Connected Meta ad account + access token reference <code className="text-xs">marketing_ad_accounts_legacy_backup</code> e backup + notun table e restored.<br />
            ✓ Orders, finance, courier, inventory — kichui touch kora hoyni.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Roadmap (8 phases)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {phases.map((p) => (
              <li key={p.n} className="flex items-start gap-3">
                <Badge variant={p.done ? "default" : "outline"} className="mt-0.5 shrink-0">
                  {p.done ? "✓" : p.n}
                </Badge>
                <span className={p.done ? "text-foreground" : "text-muted-foreground"}>{p.name}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            Next phase shuru korar age tomar approval lagbe. Bolo "Phase 2 koro".
          </p>
        </CardContent>
      </Card>
    </div>
  );
}