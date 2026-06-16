// Server-only Meta Graph API helpers. NEVER import from client/route files.
const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export type MetaInsightLevel = "campaign" | "adset" | "ad";

export interface MetaApiError {
  message: string;
  type?: string;
  code?: number;
  fbtrace_id?: string;
}

export class MetaError extends Error {
  status: number;
  apiError?: MetaApiError;
  constructor(message: string, status = 500, apiError?: MetaApiError) {
    super(message);
    this.status = status;
    this.apiError = apiError;
  }
}

async function metaFetch<T = any>(path: string, token: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const apiErr: MetaApiError | undefined = json?.error;
    throw new MetaError(apiErr?.message || `Meta API ${res.status}`, res.status, apiErr);
  }
  return json as T;
}

async function metaFetchAll<T = any>(path: string, token: string, query: Record<string, string | number | undefined> = {}): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  let first = true;
  while (first || next) {
    let json: any;
    if (next) {
      const res = await fetch(next);
      const text = await res.text();
      json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new MetaError(json?.error?.message || `Meta API ${res.status}`, res.status, json?.error);
    } else {
      json = await metaFetch<{ data: T[]; paging?: { next?: string } }>(path, token, { limit: 200, ...query });
    }
    if (Array.isArray(json?.data)) out.push(...json.data);
    next = json?.paging?.next || null;
    first = false;
    if (out.length > 50000) break; // safety
  }
  return out;
}

// ===== Public helpers =====

export async function metaListAdAccountsForToken(token: string) {
  return metaFetchAll<{
    id: string;
    account_id: string;
    name?: string;
    currency?: string;
    timezone_name?: string;
    account_status?: number;
  }>("/me/adaccounts", token, { fields: "id,account_id,name,currency,timezone_name,account_status" });
}

export async function metaMe(token: string) {
  return metaFetch<{ id: string; name?: string }>("/me", token, { fields: "id,name" });
}

export async function metaListCampaigns(adAccountId: string, token: string) {
  return metaFetchAll<any>(`/${adAccountId}/campaigns`, token, {
    fields:
      "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,updated_time",
  });
}

export async function metaListAdsets(adAccountId: string, token: string) {
  return metaFetchAll<any>(`/${adAccountId}/adsets`, token, {
    fields:
      "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,targeting,updated_time",
  });
}

export async function metaListAds(adAccountId: string, token: string) {
  return metaFetchAll<any>(`/${adAccountId}/ads`, token, {
    fields:
      "id,name,campaign_id,adset_id,status,effective_status,creative{id,name,thumbnail_url,object_story_spec},preview_shareable_link,updated_time",
  });
}

export async function metaListInsights(
  adAccountId: string,
  token: string,
  level: MetaInsightLevel,
  from: string,
  to: string,
) {
  return metaFetchAll<any>(`/${adAccountId}/insights`, token, {
    level,
    time_increment: 1,
    time_range: JSON.stringify({ since: from, until: to }),
    fields:
      "date_start,date_stop,campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values",
    limit: 500,
  });
}

export function extractPurchaseStats(row: any): { purchases: number; value: number } {
  let purchases = 0;
  let value = 0;
  for (const a of row?.actions ?? []) {
    if (a.action_type === "purchase" || a.action_type === "omni_purchase") {
      purchases += Number(a.value || 0);
    }
  }
  for (const a of row?.action_values ?? []) {
    if (a.action_type === "purchase" || a.action_type === "omni_purchase") {
      value += Number(a.value || 0);
    }
  }
  return { purchases, value };
}