import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Aggregator for the Marketing Action Inbox (right-rail).
 * Single round-trip returning everything that "needs attention".
 */
export const getMarketingActionInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) =>
    z.object({ brandIds: z.array(z.string().uuid()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const brandIds = data.brandIds;
    if (!brandIds.length) {
      return {
        syncHealth: { status: "unknown" as const, staleMinutes: null, erroredAccounts: [] as { id: string; name: string; error: string | null }[] },
        unassignedCampaigns: 0,
        pendingAttribution: 0,
        lowWalletAccounts: [] as { id: string; name: string; remaining_usd: number }[],
        totals: { attentionCount: 0 },
      };
    }

    // ── Ad accounts linked to these brands (via junction) ──
    const { data: links } = await supabase
      .from("mkt_ad_account_brands")
      .select("ad_account_id")
      .in("brand_id", brandIds);
    const accountIds = Array.from(new Set((links ?? []).map((l: any) => l.ad_account_id)));

    // ── Errored ad accounts + last insight sync staleness ──
    let erroredAccounts: { id: string; name: string; error: string | null }[] = [];
    let latestInsightSync: string | null = null;
    if (accountIds.length) {
      const { data: accts } = await supabase
        .from("mkt_ad_accounts")
        .select("id, name, status, last_error, last_insights_sync_at")
        .in("id", accountIds);
      for (const a of accts ?? []) {
        if (a.status === "error") {
          erroredAccounts.push({ id: a.id, name: a.name, error: a.last_error ?? null });
        }
        if (a.last_insights_sync_at) {
          if (!latestInsightSync || a.last_insights_sync_at > latestInsightSync) {
            latestInsightSync = a.last_insights_sync_at;
          }
        }
      }
    }

    // ── Sync staleness (successful runs across brands) ──
    const { data: syncRows } = await supabase
      .from("mkt_sync_log")
      .select("started_at, finished_at, status")
      .in("brand_id", brandIds)
      .order("started_at", { ascending: false })
      .limit(20);
    const lastOk = (syncRows ?? []).find((r: any) => r.status === "success" && r.finished_at);
    const lastOkAt = lastOk?.finished_at ?? latestInsightSync;
    const staleMinutes = lastOkAt
      ? Math.floor((Date.now() - new Date(lastOkAt).getTime()) / 60000)
      : null;
    const syncStatus =
      erroredAccounts.length > 0 || (staleMinutes != null && staleMinutes > 120)
        ? ("stale" as const)
        : staleMinutes != null && staleMinutes <= 30
          ? ("healthy" as const)
          : ("ok" as const);

    // ── Unassigned campaigns (mkt_campaigns.brand_id IS NULL for these ad accounts) ──
    let unassignedCampaigns = 0;
    if (accountIds.length) {
      const { count } = await supabase
        .from("mkt_campaigns")
        .select("id", { count: "exact", head: true })
        .in("account_id", accountIds)
        .is("brand_id", null);
      unassignedCampaigns = count ?? 0;
    }

    // ── Pending attribution candidates ──
    const { count: pendingAttribution } = await supabase
      .from("mkt_attribution_candidates")
      .select("id", { count: "exact", head: true })
      .in("brand_id", brandIds)
      .eq("status", "pending");

    // ── Low ad-wallet balance (<$50) ──
    let lowWalletAccounts: { id: string; name: string; remaining_usd: number }[] = [];
    {
      const { data: wallets } = await supabase
        .from("v_meta_ad_wallet_summary")
        .select("ad_account_id, ad_account_name, remaining_usd, brand_id")
        .in("brand_id", brandIds);
      for (const w of wallets ?? []) {
        const rem = Number(w.remaining_usd ?? 0);
        if (rem < 50) {
          lowWalletAccounts.push({
            id: w.ad_account_id,
            name: w.ad_account_name ?? "Ad account",
            remaining_usd: rem,
          });
        }
      }
    }

    const attentionCount =
      erroredAccounts.length +
      (unassignedCampaigns > 0 ? 1 : 0) +
      ((pendingAttribution ?? 0) > 0 ? 1 : 0) +
      lowWalletAccounts.length +
      (syncStatus === "stale" ? 1 : 0);

    return {
      syncHealth: {
        status: syncStatus,
        staleMinutes,
        lastOkAt,
        erroredAccounts,
      },
      unassignedCampaigns,
      pendingAttribution: pendingAttribution ?? 0,
      lowWalletAccounts,
      totals: { attentionCount },
    };
  });

export type MarketingActionInbox = Awaited<ReturnType<typeof getMarketingActionInbox>>;