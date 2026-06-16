import { createFileRoute } from "@tanstack/react-router";

// Daily Meta insights sync. Called by pg_cron with the project anon key.
// Pulls yesterday's + today's insights for every active Meta ad account.
export const Route = createFileRoute("/api/public/cron/sync-marketing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Light auth: require apikey header to equal the publishable key
        const apiKey = request.headers.get("apikey") || request.headers.get("x-apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: accounts, error } = await supabaseAdmin
          .from("marketing_ad_accounts")
          .select("id, brand_id, external_account_id, access_token_secret_ref")
          .eq("is_active", true)
          .not("access_token_secret_ref", "is", null);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const today = new Date();
        const yest = new Date(Date.now() - 24 * 3600 * 1000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const from = fmt(yest);
        const to = fmt(today);

        const { metaListInsights, extractPurchaseStats } = await import(
          "@/lib/erp/marketing/meta.server"
        );

        const results: any[] = [];
        for (const acc of accounts ?? []) {
          const result: any = {
            ad_account_id: acc.id,
            external: acc.external_account_id,
            levels: {} as Record<string, number>,
            errors: [] as string[],
          };
          const { data: campRows } = await supabaseAdmin
            .from("marketing_campaigns")
            .select("id, external_campaign_id")
            .eq("ad_account_id", acc.id);
          const { data: asetRows } = await supabaseAdmin
            .from("marketing_adsets")
            .select("id, external_adset_id")
            .eq("ad_account_id", acc.id);
          const { data: adRows } = await supabaseAdmin
            .from("marketing_ads")
            .select("id, external_ad_id")
            .eq("ad_account_id", acc.id);
          const cm = new Map((campRows ?? []).map((c: any) => [c.external_campaign_id, c.id]));
          const sm = new Map((asetRows ?? []).map((a: any) => [a.external_adset_id, a.id]));
          const am = new Map((adRows ?? []).map((a: any) => [a.external_ad_id, a.id]));

          for (const level of ["campaign", "adset", "ad"] as const) {
            try {
              const rows = await metaListInsights(
                acc.external_account_id,
                acc.access_token_secret_ref!,
                level,
                from,
                to,
              );
              if (!rows.length) {
                result.levels[level] = 0;
                continue;
              }
              const upserts = rows.map((r: any) => {
                const { purchases, value } = extractPurchaseStats(r);
                const spend = Number(r.spend ?? 0);
                return {
                  brand_id: acc.brand_id,
                  ad_account_id: acc.id,
                  date: r.date_start,
                  level,
                  campaign_id: r.campaign_id ? cm.get(r.campaign_id) ?? null : null,
                  adset_id: r.adset_id ? sm.get(r.adset_id) ?? null : null,
                  ad_id: r.ad_id ? am.get(r.ad_id) ?? null : null,
                  external_campaign_id: r.campaign_id ?? null,
                  external_adset_id: r.adset_id ?? null,
                  external_ad_id: r.ad_id ?? null,
                  spend,
                  impressions: Number(r.impressions ?? 0),
                  reach: Number(r.reach ?? 0),
                  clicks: Number(r.clicks ?? 0),
                  link_clicks: Number(r.inline_link_clicks ?? 0),
                  landing_page_views: 0,
                  ctr: Number(r.ctr ?? 0),
                  cpc: Number(r.cpc ?? 0),
                  cpm: Number(r.cpm ?? 0),
                  meta_purchases: purchases,
                  meta_purchase_value: value,
                  meta_roas: spend > 0 ? value / spend : 0,
                  raw_json: r,
                  synced_at: new Date().toISOString(),
                };
              });
              await supabaseAdmin
                .from("marketing_insights_daily")
                .delete()
                .eq("ad_account_id", acc.id)
                .eq("level", level)
                .gte("date", from)
                .lte("date", to);
              const ins = await supabaseAdmin.from("marketing_insights_daily").insert(upserts);
              if (ins.error) result.errors.push(`${level}: ${ins.error.message}`);
              else result.levels[level] = upserts.length;
            } catch (e: any) {
              result.errors.push(`${level}: ${e?.message}`);
            }
          }

          await supabaseAdmin
            .from("marketing_ad_accounts")
            .update({
              last_synced_at: new Date().toISOString(),
              last_sync_error: result.errors.length ? result.errors.join(" | ") : null,
            })
            .eq("id", acc.id);
          results.push(result);
        }

        return Response.json({ ok: true, from, to, accounts: results });
      },
    },
  },
});