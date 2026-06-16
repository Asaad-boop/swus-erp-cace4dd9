// Server-only Meta Graph API client. Lazy import only from server-function handlers.

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FETCH_TIMEOUT_MS = 20_000;

export type MetaAccount = {
  id: string; // act_xxx
  account_id: string; // numeric
  name: string;
  currency: string | null;
  timezone_name: string | null;
  business?: { id: string; name: string } | null;
  account_status?: number;
};

export type MetaCampaign = {
  id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  start_time: string | null;
  stop_time: string | null;
};

export type MetaAdset = {
  id: string;
  name: string;
  campaign_id: string;
  status: string | null;
  effective_status: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  targeting?: any;
};

export type MetaAd = {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: string | null;
  effective_status: string | null;
  creative?: { id: string; body?: string; thumbnail_url?: string };
};

export type MetaInsight = {
  date_start: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  account_id?: string;
  spend: string;
  impressions: string;
  reach?: string;
  clicks: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
};

export function getMetaToken(): string {
  const t =
    process.env.META_SYSTEM_USER_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    (globalThis as any).__LOVABLE_RUNTIME_ENV__?.META_SYSTEM_USER_TOKEN;
  if (!t) throw new Error("No access token");
  return t;
}

/** Verify an ad-account credential set by hitting the account info endpoint.
 *  Only requests fields readable with `ads_read`. Business info needs
 *  `business_management` scope; we try it but fall back silently. */
export async function verifyAdAccount(actId: string, token: string) {
  const path = `/${actId.startsWith("act_") ? actId : `act_${actId}`}`;
  const base = await metaGet<{
    id: string;
    name: string;
    currency: string;
    timezone_name: string;
    account_status: number;
  }>(
    path,
    { fields: "id,name,currency,timezone_name,account_status" },
    token,
  );
  let business: { id: string; name: string } | null = null;
  try {
    const b = await metaGet<{ business?: { id: string; name: string } }>(
      path,
      { fields: "business{id,name}" },
      token,
    );
    business = b.business ?? null;
  } catch {
    // missing business_management scope — non-fatal
  }
  return { ...base, business };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function metaGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const url = `${GRAPH_BASE}${path}?${qs}`;
  const res = await fetchWithTimeout(url);
  const json = (await res.json()) as any;
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `Meta API ${res.status}`;
    const err: any = new Error(msg);
    err.code = json?.error?.code;
    err.type = json?.error?.type;
    throw err;
  }
  return json as T;
}

/** Auto-paginate Graph API list endpoints. */
async function metaGetAll<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  let page = 0;
  while (page < maxPages) {
    let json: any;
    if (next) {
      const res = await fetchWithTimeout(next);
      json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || `Meta API ${res.status}`);
      }
    } else {
      json = await metaGet<any>(path, { ...params, limit: params.limit ?? "100" }, token);
    }
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
    if (!next) break;
    page++;
  }
  return out;
}

export async function listMyAdAccounts(token: string = getMetaToken()): Promise<MetaAccount[]> {
  return metaGetAll<MetaAccount>(
    "/me/adaccounts",
    {
      fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}",
    },
    token,
  );
}

export async function listCampaigns(actId: string, token = getMetaToken()) {
  return metaGetAll<MetaCampaign>(
    `/${actId}/campaigns`,
    {
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time",
    },
    token,
  );
}

export async function listAdsets(actId: string, token = getMetaToken()) {
  return metaGetAll<MetaAdset>(
    `/${actId}/adsets`,
    {
      fields:
        "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting",
    },
    token,
  );
}

export async function listAds(actId: string, token = getMetaToken()) {
  return metaGetAll<MetaAd>(
    `/${actId}/ads`,
    {
      fields:
        "id,name,adset_id,campaign_id,status,effective_status,creative{id,body,thumbnail_url}",
    },
    token,
  );
}

/**
 * Pull daily insights for an ad account, broken down per ad per day.
 * `since` / `until` are YYYY-MM-DD (inclusive).
 */
export async function getDailyInsights(
  actId: string,
  since: string,
  until: string,
  token = getMetaToken(),
): Promise<MetaInsight[]> {
  return metaGetAll<MetaInsight>(
    `/${actId}/insights`,
    {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields:
        "ad_id,adset_id,campaign_id,account_id,date_start,spend,impressions,reach,clicks,cpm,cpc,ctr,actions,action_values",
      action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    },
    token,
  );
}

/** Extract purchase / lead / add-to-cart counts from insight actions. */
export function extractMetaConversions(insight: MetaInsight) {
  const sumAction = (list: Array<{ action_type: string; value: string }> | undefined, types: string[]) => {
    if (!list) return 0;
    let total = 0;
    for (const a of list) {
      if (types.includes(a.action_type)) total += Number(a.value) || 0;
    }
    return total;
  };
  const purchases = sumAction(insight.actions, [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
  ]);
  const purchase_value = sumAction(insight.action_values, [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
  ]);
  const add_to_cart = sumAction(insight.actions, [
    "add_to_cart",
    "offsite_conversion.fb_pixel_add_to_cart",
    "omni_add_to_cart",
  ]);
  const initiate_checkout = sumAction(insight.actions, [
    "initiate_checkout",
    "offsite_conversion.fb_pixel_initiate_checkout",
    "omni_initiated_checkout",
  ]);
  const leads = sumAction(insight.actions, [
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
  ]);
  return { purchases, purchase_value, add_to_cart, initiate_checkout, leads };
}

export function isMetaConfigured(): boolean {
  try {
    getMetaToken();
    return true;
  } catch {
    return false;
  }
}
