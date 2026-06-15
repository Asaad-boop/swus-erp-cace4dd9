// Server-only Meta (Facebook) Graph API client for Marketing module.
// Imported lazily inside server function handlers — never from client code.

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const FETCH_TIMEOUT_MS = 20_000;

export function getMetaSystemToken(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) {
    throw new Error(
      "META_SYSTEM_USER_TOKEN secret nai. Settings → Secrets e add koro.",
    );
  }
  return t;
}

/**
 * Resolve the Meta access token for an ad account.
 * Prefers per-account token stored in `marketing_ad_accounts.metadata.access_token`.
 * Falls back to the global `META_SYSTEM_USER_TOKEN` env secret.
 */
export function getAccountToken(metadata: any): string {
  const t = metadata?.access_token;
  if (typeof t === "string" && t.trim().length > 0) return t.trim();
  return getMetaSystemToken();
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Meta request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function metaGet<T = any>(path: string, params: Record<string, string | number> = {}, token?: string): Promise<T> {
  const tok = token || getMetaSystemToken();
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", tok);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url.toString());
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
      if (!res.ok) {
        const code = json?.error?.code;
        const msg = json?.error?.message || text || `Meta ${res.status}`;
        // Rate limit / transient → backoff
        if (res.status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          lastErr = new Error(`Meta rate limited: ${msg}`);
          continue;
        }
        if (code === 190) {
          throw new Error("Meta access token expired or invalid. Reconnect koro.");
        }
        throw new Error(`Meta ${path} failed (${res.status}): ${String(msg).slice(0, 280)}`);
      }
      return json as T;
    } catch (e) {
      lastErr = e;
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw (lastErr as Error) ?? new Error("Meta request failed");
}

export type MetaInsightRow = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number;
  purchase_value: number;
  purchase_roas: number | null;
  outbound_clicks: number;
  landing_page_views: number;
  raw: any;
};

function pickAction(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) total += Number(a.value || 0);
  }
  return total;
}

export async function metaListAccounts(token?: string) {
  const tok = token || getMetaSystemToken();
  const j = await metaGet<{ data: any[] }>(
    `/me/adaccounts`,
    { fields: "id,account_id,name,currency,timezone_name,account_status", limit: 100 },
    tok,
  );
  return (j.data ?? []).map((a) => ({
    external_account_id: a.account_id || String(a.id || "").replace(/^act_/, ""),
    name: a.name,
    currency: a.currency,
    timezone_name: a.timezone_name,
    status: a.account_status,
  }));
}

export async function metaVerifyAccount(externalAccountId: string, token?: string) {
  const tok = token || getMetaSystemToken();
  return metaGet<any>(
    `/act_${externalAccountId}`,
    { fields: "id,account_id,name,currency,timezone_name,account_status" },
    tok,
  );
}

export async function metaListCampaigns(externalAccountId: string, token?: string) {
  const tok = token || getMetaSystemToken();
  const all: any[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const params: Record<string, string | number> = {
      fields: "id,name,objective,status,buying_type,daily_budget,lifetime_budget,start_time,stop_time,updated_time",
      limit: 100,
    };
    if (after) params.after = after;
    const j = await metaGet<{ data: any[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/act_${externalAccountId}/campaigns`,
      params,
      tok,
    );
    all.push(...(j.data ?? []));
    if (!j.paging?.next || !j.paging.cursors?.after) break;
    after = j.paging.cursors.after;
  }
  return all.map((c) => ({
    external_campaign_id: String(c.id),
    name: c.name,
    objective: c.objective ?? null,
    status: c.status ?? null,
    buying_type: c.buying_type ?? null,
    daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
    start_time: c.start_time ?? null,
    stop_time: c.stop_time ?? null,
    raw: c,
  }));
}

export async function metaCampaignInsights(
  externalCampaignId: string,
  since: string,
  until: string,
  token?: string,
): Promise<MetaInsightRow[]> {
  const tok = token || getMetaSystemToken();
  const fields = [
    "spend", "impressions", "clicks", "reach", "ctr", "cpc", "cpm",
    "actions", "action_values", "purchase_roas",
    "outbound_clicks",
  ].join(",");
  const j = await metaGet<{ data: any[] }>(
    `/${externalCampaignId}/insights`,
    {
      fields,
      level: "campaign",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      limit: 500,
    },
    tok,
  );
  return (j.data ?? []).map((r) => {
    const purchases = pickAction(r.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
    const purchase_value = pickAction(r.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
    const outbound = pickAction(r.outbound_clicks, ["outbound_click"]);
    const lpv = pickAction(r.actions, ["landing_page_view"]);
    const roasArr: any[] = Array.isArray(r.purchase_roas) ? r.purchase_roas : [];
    const roas = roasArr.length ? Number(roasArr[0].value) : null;
    return {
      date: r.date_start,
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      reach: Number(r.reach || 0),
      ctr: r.ctr != null ? Number(r.ctr) : null,
      cpc: r.cpc != null ? Number(r.cpc) : null,
      cpm: r.cpm != null ? Number(r.cpm) : null,
      purchases,
      purchase_value,
      purchase_roas: roas,
      outbound_clicks: outbound,
      landing_page_views: lpv,
      raw: r,
    } satisfies MetaInsightRow;
  });
}