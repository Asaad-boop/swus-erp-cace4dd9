// Server-only Meta sync helpers. Take a supabase client (any role) and do the work.
// Imported by meta.functions.ts (server fn module) and the cron route.

import {
  listCampaigns,
  listAdsets,
  listAds,
  getDailyInsights,
  extractMetaConversions,
} from "./meta.server";

function actId(externalId: string): string {
  return externalId.startsWith("act_") ? externalId : `act_${externalId}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function withSyncLog<T extends { rows: number; meta?: any }>(
  supabase: any,
  args: {
    brand_id: string | null;
    account_id: string | null;
    kind: "structure" | "insights" | "attribution" | "finance_post";
    run: () => Promise<T>;
  },
): Promise<{ ok: true; rows: number; meta?: any }> {
  const started_at = new Date().toISOString();
  const { data: logRow } = await supabase
    .from("mkt_sync_log")
    .insert({
      brand_id: args.brand_id,
      account_id: args.account_id,
      kind: args.kind,
      status: "running",
      started_at,
    })
    .select("id")
    .single();
  try {
    const result = await args.run();
    await supabase
      .from("mkt_sync_log")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_processed: result.rows,
        meta: result.meta ?? null,
      })
      .eq("id", logRow!.id);
    return { ok: true, rows: result.rows, meta: result.meta };
  } catch (e: any) {
    await supabase
      .from("mkt_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: String(e?.message ?? e),
      })
      .eq("id", logRow!.id);
    throw e;
  }
}

export async function runStructureSync(supabase: any, accountId: string) {
  const { data: acc, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accErr || !acc) throw new Error("Ad account not found");
  const act = actId(acc.external_id);

  try {
    return await withSyncLog(supabase, {
      brand_id: acc.brand_id,
      account_id: acc.id,
      kind: "structure",
      run: async () => {
        const [camps, adsets, ads] = await Promise.all([
          listCampaigns(act),
          listAdsets(act),
          listAds(act),
        ]);

        if (camps.length) {
          const rows = camps.map((c) => ({
            brand_id: acc.brand_id,
            account_id: acc.id,
            external_id: c.id,
            name: c.name,
            objective: c.objective ?? null,
            status: c.status ?? null,
            effective_status: c.effective_status ?? null,
            daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
            start_time: c.start_time ?? null,
            stop_time: c.stop_time ?? null,
            raw: c as any,
          }));
          const { error } = await supabase
            .from("mkt_campaigns")
            .upsert(rows, { onConflict: "account_id,external_id" });
          if (error) throw error;
        }

        const { data: campRows } = await supabase
          .from("mkt_campaigns")
          .select("id,external_id")
          .eq("account_id", acc.id);
        const campMap = new Map<string, string>(
          (campRows ?? []).map((r: any) => [r.external_id, r.id]),
        );

        if (adsets.length) {
          const rows = adsets
            .filter((a) => campMap.has(a.campaign_id))
            .map((a) => ({
              brand_id: acc.brand_id,
              account_id: acc.id,
              campaign_id: campMap.get(a.campaign_id)!,
              external_id: a.id,
              name: a.name,
              status: a.status ?? null,
              effective_status: a.effective_status ?? null,
              daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
              lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
              targeting_summary: a.targeting ? JSON.stringify(a.targeting).slice(0, 500) : null,
              raw: a as any,
            }));
          if (rows.length) {
            const { error } = await supabase
              .from("mkt_adsets")
              .upsert(rows, { onConflict: "account_id,external_id" });
            if (error) throw error;
          }
        }

        const { data: adsetRows } = await supabase
          .from("mkt_adsets")
          .select("id,external_id")
          .eq("account_id", acc.id);
        const adsetMap = new Map<string, string>(
          (adsetRows ?? []).map((r: any) => [r.external_id, r.id]),
        );

        if (ads.length) {
          const rows = ads
            .filter((a) => campMap.has(a.campaign_id) && adsetMap.has(a.adset_id))
            .map((a) => ({
              brand_id: acc.brand_id,
              account_id: acc.id,
              campaign_id: campMap.get(a.campaign_id)!,
              adset_id: adsetMap.get(a.adset_id)!,
              external_id: a.id,
              name: a.name,
              status: a.status ?? null,
              effective_status: a.effective_status ?? null,
              creative_body: a.creative?.body ?? null,
              creative_thumbnail: a.creative?.thumbnail_url ?? null,
              raw: a as any,
            }));
          if (rows.length) {
            const { error } = await supabase
              .from("mkt_ads")
              .upsert(rows, { onConflict: "account_id,external_id" });
            if (error) throw error;
          }
        }

        await supabase
          .from("mkt_ad_accounts")
          .update({
            last_structure_sync_at: new Date().toISOString(),
            last_error: null,
            status: "active",
          })
          .eq("id", acc.id);

        return {
          rows: camps.length + adsets.length + ads.length,
          meta: { campaigns: camps.length, adsets: adsets.length, ads: ads.length },
        };
      },
    });
  } catch (e: any) {
    await supabase
      .from("mkt_ad_accounts")
      .update({ last_error: String(e?.message ?? e), status: "error" })
      .eq("id", acc.id);
    throw e;
  }
}

export async function runInsightsSync(
  supabase: any,
  accountId: string,
  opts: { since?: string; until?: string; days: number },
) {
  const { data: acc, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accErr || !acc) throw new Error("Ad account not found");
  const act = actId(acc.external_id);

  const until = opts.until ?? isoDate(new Date());
  const since =
    opts.since ??
    isoDate(new Date(Date.now() - (opts.days - 1) * 24 * 60 * 60 * 1000));

  try {
    return await withSyncLog(supabase, {
      brand_id: acc.brand_id,
      account_id: acc.id,
      kind: "insights",
      run: async () => {
        const insights = await getDailyInsights(act, since, until);

        const [{ data: adRows }, { data: adsetRows }, { data: campRows }] = await Promise.all([
          supabase.from("mkt_ads").select("id,external_id").eq("account_id", acc.id),
          supabase.from("mkt_adsets").select("id,external_id").eq("account_id", acc.id),
          supabase.from("mkt_campaigns").select("id,external_id").eq("account_id", acc.id),
        ]);
        const adMap = new Map<string, string>(
          (adRows ?? []).map((r: any) => [r.external_id, r.id]),
        );
        const adsetMap = new Map<string, string>(
          (adsetRows ?? []).map((r: any) => [r.external_id, r.id]),
        );
        const campMap = new Map<string, string>(
          (campRows ?? []).map((r: any) => [r.external_id, r.id]),
        );

        const rows = insights.map((ins) => {
          const conv = extractMetaConversions(ins);
          return {
            brand_id: acc.brand_id,
            account_id: acc.id,
            date: ins.date_start,
            ad_id: ins.ad_id ? adMap.get(ins.ad_id) ?? null : null,
            adset_id: ins.adset_id ? adsetMap.get(ins.adset_id) ?? null : null,
            campaign_id: ins.campaign_id ? campMap.get(ins.campaign_id) ?? null : null,
            spend: Number(ins.spend) || 0,
            impressions: Number(ins.impressions) || 0,
            reach: Number(ins.reach) || 0,
            clicks: Number(ins.clicks) || 0,
            cpm: ins.cpm ? Number(ins.cpm) : null,
            cpc: ins.cpc ? Number(ins.cpc) : null,
            ctr: ins.ctr ? Number(ins.ctr) : null,
            meta_purchases: conv.purchases,
            meta_purchase_value: conv.purchase_value,
            meta_add_to_cart: conv.add_to_cart,
            meta_initiate_checkout: conv.initiate_checkout,
            meta_leads: conv.leads,
            raw: ins as any,
          };
        });

        if (rows.length) {
          // Replace the window to keep things idempotent without needing a unique constraint.
          await supabase
            .from("mkt_insights_daily")
            .delete()
            .eq("account_id", acc.id)
            .gte("date", since)
            .lte("date", until);
          const { error } = await supabase.from("mkt_insights_daily").insert(rows);
          if (error) throw error;
        }

        await supabase
          .from("mkt_ad_accounts")
          .update({
            last_insights_sync_at: new Date().toISOString(),
            last_error: null,
            status: "active",
          })
          .eq("id", acc.id);

        return { rows: rows.length, meta: { since, until } };
      },
    });
  } catch (e: any) {
    await supabase
      .from("mkt_ad_accounts")
      .update({ last_error: String(e?.message ?? e), status: "error" })
      .eq("id", acc.id);
    throw e;
  }
}
