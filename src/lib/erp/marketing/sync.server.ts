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
  if (!acc.access_token) throw new Error("Access token missing — edit account and add token");
  const act = actId(acc.external_id);
  const tok = acc.access_token as string;

  try {
    return await withSyncLog(supabase, {
      brand_id: acc.brand_id,
      account_id: acc.id,
      kind: "structure",
      run: async () => {
        const [camps, adsets, ads] = await Promise.all([
          listCampaigns(act, tok),
          listAdsets(act, tok),
          listAds(act, tok),
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
  if (!acc.access_token) throw new Error("Access token missing — edit account and add token");
  const act = actId(acc.external_id);
  const tok = acc.access_token as string;

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
        const insights = await getDailyInsights(act, since, until, tok);

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

        // Replace the window to keep things idempotent and remove stale rows when Meta returns 0.
        const { error: delErr } = await supabase
          .from("mkt_insights_daily")
          .delete()
          .eq("account_id", acc.id)
          .gte("date", since)
          .lte("date", until);
        if (delErr) throw delErr;

        if (rows.length) {
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

        // Auto-post Meta spend to finance (BDT). Failure here doesn't fail the sync.
        let financePosted: any = null;
        try {
          financePosted = await postMetaSpendToFinance(supabase, acc, since, until);
        } catch (postErr: any) {
          financePosted = { error: String(postErr?.message ?? postErr) };
        }

        return {
          rows: rows.length,
          meta: { since, until, finance: financePosted },
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

/**
 * Auto-post Meta ad spend as marketing expense in finance (BDT).
 * - Aggregates daily spend per (account, date) from mkt_insights_daily.
 * - Converts to BDT using account.usd_to_bdt_rate (skips conversion if account currency is BDT).
 * - Upserts a mkt_manual_expenses row (source='meta_auto') per (brand, account, date).
 * - Maintains a linked erp_transactions expense row against the configured wallet
 *   (or first active wallet for the brand if none configured).
 * Idempotent — re-running for the same window updates existing rows.
 */
export async function postMetaSpendToFinance(
  supabase: any,
  acc: {
    id: string;
    brand_id: string;
    name: string;
    currency: string | null;
    usd_to_bdt_rate: number | string;
    auto_post_to_finance?: boolean;
    finance_wallet_id?: string | null;
  },
  since: string,
  until: string,
) {
  if (acc.auto_post_to_finance === false) {
    return { skipped: "auto_post_disabled" };
  }

  // Pick wallet: configured one, else first active wallet for brand
  let walletId = acc.finance_wallet_id ?? null;
  if (!walletId) {
    const { data: w } = await supabase
      .from("erp_accounts")
      .select("id")
      .eq("brand_id", acc.brand_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    walletId = w?.id ?? null;
  }

  // Aggregate daily spend (USD) for this account in window
  const { data: insRows, error: insErr } = await supabase
    .from("mkt_insights_daily")
    .select("date, spend")
    .eq("account_id", acc.id)
    .gte("date", since)
    .lte("date", until);
  if (insErr) throw insErr;

  const dailyUsd = new Map<string, number>();
  for (const r of insRows ?? []) {
    dailyUsd.set(r.date, (dailyUsd.get(r.date) ?? 0) + (Number(r.spend) || 0));
  }

  const fx = Number(acc.usd_to_bdt_rate) || 110;
  const isBdtAcc = (acc.currency ?? "").toUpperCase() === "BDT";

  // Existing auto-posted rows in window
  const { data: existing, error: exErr } = await supabase
    .from("mkt_manual_expenses")
    .select("id, date, transaction_id, amount")
    .eq("brand_id", acc.brand_id)
    .eq("mkt_ad_account_id", acc.id)
    .eq("source", "meta_auto")
    .gte("date", since)
    .lte("date", until);
  if (exErr) throw exErr;
  const existingByDate = new Map<string, any>(
    (existing ?? []).map((r: any) => [r.date, r]),
  );

  let inserted = 0;
  let updated = 0;
  let removed = 0;
  let totalBdt = 0;
  const txByDate = new Map<string, string>();

  for (const [date, usd] of dailyUsd) {
    const bdt = +(isBdtAcc ? usd : usd * fx).toFixed(2);
    const ex = existingByDate.get(date);
    existingByDate.delete(date);

    if (bdt <= 0) {
      // No spend — remove any prior posting for this date
      if (ex) {
        await supabase.from("mkt_manual_expenses").delete().eq("id", ex.id);
        if (ex.transaction_id) {
          await supabase.from("erp_transactions").delete().eq("id", ex.transaction_id);
        }
        removed++;
      }
      continue;
    }

    totalBdt += bdt;
    const description = `Meta Ads — ${acc.name} (${date})`;

    let txId: string | null = ex?.transaction_id ?? null;
    if (walletId) {
      if (txId) {
        const { error } = await supabase
          .from("erp_transactions")
          .update({
            amount: bdt,
            account_id: walletId,
            transaction_date: date,
            description,
          })
          .eq("id", txId);
        if (error) throw error;
      } else {
        const { data: txIns, error } = await supabase
          .from("erp_transactions")
          .insert({
            brand_id: acc.brand_id,
            txn_type: "expense",
            account_id: walletId,
            amount: bdt,
            transaction_date: date,
            description,
            reference_type: "meta_spend",
            reference_id: acc.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        txId = txIns!.id;
      }
    }

    if (ex) {
      const { error } = await supabase
        .from("mkt_manual_expenses")
        .update({
          amount: bdt,
          currency: "BDT",
          transaction_id: txId,
        })
        .eq("id", ex.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase.from("mkt_manual_expenses").insert({
        brand_id: acc.brand_id,
        mkt_ad_account_id: acc.id,
        source: "meta_auto",
        date,
        amount: bdt,
        currency: "BDT",
        vendor: "Meta",
        category: "meta_ads",
        account_id: walletId,
        transaction_id: txId,
        note: `Auto-synced from Meta Ads — ${acc.name}`,
      });
      if (error) throw error;
      inserted++;
    }
    if (txId) txByDate.set(date, txId);
  }

  // Any existing rows in window with no insight day anymore → remove (Meta returned 0)
  for (const ex of existingByDate.values()) {
    await supabase.from("mkt_manual_expenses").delete().eq("id", ex.id);
    if (ex.transaction_id) {
      await supabase.from("erp_transactions").delete().eq("id", ex.transaction_id);
    }
    removed++;
  }

  // Per-product allocation: split each campaign's BDT spend across linked products by weight.
  let allocations = 0;
  try {
    const txIds = Array.from(txByDate.values());
    if (txIds.length > 0) {
      // Clear prior allocations for these transactions so re-syncs stay clean.
      await supabase
        .from("erp_product_expense_allocations")
        .delete()
        .in("expense_transaction_id", txIds);

      // Per-campaign-per-day spend (USD) for this account in window
      const { data: perCamp } = await supabase
        .from("mkt_insights_daily")
        .select("date, campaign_id, spend")
        .eq("account_id", acc.id)
        .gte("date", since)
        .lte("date", until);

      // Campaign → product links with weights
      const { data: links } = await supabase
        .from("mkt_campaign_products")
        .select("campaign_id, product_id, weight")
        .eq("brand_id", acc.brand_id);
      const linkByCamp = new Map<string, Array<{ product_id: string; weight: number }>>();
      for (const l of links ?? []) {
        if (!l.campaign_id || !l.product_id) continue;
        const arr = linkByCamp.get(l.campaign_id) ?? [];
        arr.push({ product_id: l.product_id, weight: Number(l.weight) || 1 });
        linkByCamp.set(l.campaign_id, arr);
      }

      const rows: any[] = [];
      for (const r of perCamp ?? []) {
        const txId = txByDate.get(r.date);
        if (!txId || !r.campaign_id) continue;
        const products = linkByCamp.get(r.campaign_id);
        if (!products || products.length === 0) continue;
        const usd = Number(r.spend) || 0;
        if (usd <= 0) continue;
        const bdt = +(isBdtAcc ? usd : usd * fx).toFixed(2);
        const totalW = products.reduce((s, p) => s + p.weight, 0) || 1;
        for (const p of products) {
          const share = +((bdt * p.weight) / totalW).toFixed(2);
          if (share <= 0) continue;
          rows.push({
            brand_id: acc.brand_id,
            product_id: p.product_id,
            expense_transaction_id: txId,
            expense_type: "meta_ads",
            amount: share,
            allocation_method: "campaign_weight",
            note: `Meta spend — ${r.date}`,
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase
          .from("erp_product_expense_allocations")
          .insert(rows);
        if (error) throw error;
        allocations = rows.length;
      }
    }
  } catch (e: any) {
    // Allocation failure shouldn't fail the whole sync
    return {
      inserted,
      updated,
      removed,
      total_bdt: +totalBdt.toFixed(2),
      fx,
      wallet_id: walletId,
      wallet_missing: !walletId,
      allocation_error: String(e?.message ?? e),
    };
  }

  return {
    inserted,
    updated,
    removed,
    total_bdt: +totalBdt.toFixed(2),
    fx,
    wallet_id: walletId,
    wallet_missing: !walletId,
    allocations,
  };
}
