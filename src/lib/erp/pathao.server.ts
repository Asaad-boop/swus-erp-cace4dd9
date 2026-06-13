// Server-only Pathao API client with in-memory token cache.
// Imported lazily inside server function handlers — never from client code.

const BASE = process.env.PATHAO_BASE_URL || "https://api-hermes.pathao.com";

type TokenCache = { access_token: string; refresh_token?: string; expires_at: number };
let cached: TokenCache | null = null;

async function issueToken(): Promise<TokenCache> {
  const body = {
    client_id: process.env.PATHAO_CLIENT_ID,
    client_secret: process.env.PATHAO_CLIENT_SECRET,
    username: process.env.PATHAO_USERNAME,
    password: process.env.PATHAO_PASSWORD,
    grant_type: "password",
  };
  const res = await fetch(`${BASE}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Pathao auth failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const j: any = await res.json();
  const access = j.access_token || j.data?.access_token;
  const refresh = j.refresh_token || j.data?.refresh_token;
  const expires = (j.expires_in || j.data?.expires_in || 3600) as number;
  if (!access) throw new Error("Pathao auth: no access_token in response");
  return { access_token: access, refresh_token: refresh, expires_at: Date.now() + (expires - 60) * 1000 };
}

async function getToken(): Promise<string> {
  if (cached && cached.expires_at > Date.now()) return cached.access_token;
  cached = await issueToken();
  return cached.access_token;
}

async function pathaoFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const doFetch = async (tok: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok}`,
        ...(init.headers || {}),
      },
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    cached = null;
    res = await doFetch(await getToken());
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || `Pathao error ${res.status}`;
    throw new Error(`Pathao ${path} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 200)}`);
  }
  return (json?.data ?? json) as T;
}

export type PathaoCity = { city_id: number; city_name: string };
export type PathaoZone = { zone_id: number; zone_name: string };
export type PathaoArea = { area_id: number; area_name: string; home_delivery_available?: boolean; pickup_available?: boolean };

export async function pathaoCities(): Promise<PathaoCity[]> {
  const d: any = await pathaoFetch("/aladdin/api/v1/city-list");
  return d?.data ?? d ?? [];
}
export async function pathaoZones(cityId: number): Promise<PathaoZone[]> {
  const d: any = await pathaoFetch(`/aladdin/api/v1/cities/${cityId}/zone-list`);
  return d?.data ?? d ?? [];
}
export async function pathaoAreas(zoneId: number): Promise<PathaoArea[]> {
  const d: any = await pathaoFetch(`/aladdin/api/v1/zones/${zoneId}/area-list`);
  return d?.data ?? d ?? [];
}

export type PathaoPriceInput = {
  store_id: number;
  item_type: 1 | 2; // 1=document, 2=parcel
  delivery_type: 48 | 12; // 48=normal, 12=on-demand
  item_weight: number;
  recipient_city: number;
  recipient_zone: number;
};

export async function pathaoPrice(input: PathaoPriceInput) {
  return pathaoFetch("/aladdin/api/v1/merchant/price-plan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type PathaoCreateInput = {
  store_id: number;
  merchant_order_id?: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_city: number;
  recipient_zone: number;
  recipient_area?: number;
  delivery_type: 48 | 12;
  item_type: 1 | 2;
  special_instruction?: string;
  item_quantity: number;
  item_weight: number;
  amount_to_collect: number;
  item_description?: string;
};

export async function pathaoCreateOrder(input: PathaoCreateInput) {
  return pathaoFetch("/aladdin/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function pathaoTrack(consignmentId: string) {
  return pathaoFetch(`/aladdin/api/v1/orders/${consignmentId}/info`);
}

export function defaultStoreId(): number {
  const sid = Number(process.env.PATHAO_STORE_ID);
  if (!sid) throw new Error("PATHAO_STORE_ID is not configured");
  return sid;
}