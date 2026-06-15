import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — called every 30 min by pg_cron.
// Syncs campaigns + insights for all auto-sync-enabled brands.
// Auth: header `x-cron-secret` must equal env CRON_SECRET (server-only secret).
export const Route = createFileRoute("/api/public/cron/sync-marketing")({
  server: {
    handlers: {
      GET: async ({ request }) => guard(request) ?? handler(),
      POST: async ({ request }) => guard(request) ?? handler(),
    },
  },
});

function guard(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response("Cron not configured", { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

async function handler() {
  try {
    const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = tryGetSupabaseAdmin();
    if (!supabaseAdmin) {
      return Response.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 503 });
    }

    const { data: accounts, error } = await supabaseAdmin
      .from("marketing_ad_accounts")
      .select("id, brand_id, external_account_id")
      .eq("is_active", true);
    if (error) throw error;
    const { metaListCampaigns } = await import("@/lib/erp/marketing/meta.server");
    const { runInsightsSync } = await import("@/lib/erp/marketing/marketing.functions");

    const results: any[] = [];
    for (const acc of accounts ?? []) {
      try {
        // Check brand auto_sync
        const { data: settings } = await supabaseAdmin
          .from("marketing_settings")
          .select("auto_sync_enabled")
          .eq("brand_id", acc.brand_id)
          .maybeSingle();
        if (settings && settings.auto_sync_enabled === false) {
          results.push({ account: acc.id, skipped: true });
          continue;
        }

        // Sync campaigns
        const campaigns = await metaListCampaigns(acc.external_account_id);
        if (campaigns.length > 0) {
          const rows = campaigns.map((c) => ({
            brand_id: acc.brand_id,
            ad_account_id: acc.id,
            external_campaign_id: c.external_campaign_id,
            name: c.name,
            objective: c.objective,
            status: c.status,
            buying_type: c.buying_type,
            daily_budget: c.daily_budget,
            lifetime_budget: c.lifetime_budget,
            start_time: c.start_time,
            stop_time: c.stop_time,
            raw: c.raw,
            updated_at: new Date().toISOString(),
          }));
          await supabaseAdmin
            .from("marketing_campaigns")
            .upsert(rows, { onConflict: "ad_account_id,external_campaign_id" });
        }

        // Sync last 3 days insights
        const r = await runInsightsSync(acc.id, 3, supabaseAdmin);
        await supabaseAdmin
          .from("marketing_ad_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", acc.id);
        results.push({ account: acc.id, ...r });
      } catch (e) {
        results.push({ account: acc.id, error: (e as Error).message });
      }
    }

    return Response.json({ ok: true, results });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}