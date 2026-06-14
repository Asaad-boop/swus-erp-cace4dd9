// Server-only Pathao API client.
// Imported lazily inside server function handlers — never from client code.

export type PathaoCreds = {
  base_url: string;
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  store_id: number;
};

const tokenCache = new Map<string, { access_token: string; expires_at: number }>();
const FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Pathao request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// In-memory caches for geo lookups. Pathao city/zone/area lists are huge but
// nearly static — caching them per worker process eliminates the biggest
// per-order latency in bulk uploads.
const TTL = 1000 * 60 * 60 * 6; // 6h
const geoCache = new Map<string, { value: any; expires_at: number }>();
const inflight = new Map<string, Promise<any>>();

async function memo<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const c = geoCache.get(key);
  if (c && c.expires_at > Date.now()) return c.value as T;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      const v = await loader();
      geoCache.set(key, { value: v, expires_at: Date.now() + TTL });
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function issueToken(creds: PathaoCreds) {
  const res = await fetchWithTimeout(`${creds.base_url}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      username: creds.username,
      password: creds.password,
      grant_type: "password",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Pathao auth failed (${res.status}): ${txt.slice(0, 240)}`);
  }
  const j: any = await res.json();
  const access = j.access_token || j.data?.access_token;
  const expires = (j.expires_in || j.data?.expires_in || 3600) as number;
  if (!access) throw new Error("Pathao auth: no access_token in response");
  return { access_token: access, expires_at: Date.now() + (expires - 60) * 1000 };
}

async function getToken(creds: PathaoCreds): Promise<string> {
  const key = `${creds.base_url}::${creds.client_id}::${creds.username}`;
  const c = tokenCache.get(key);
  if (c && c.expires_at > Date.now()) return c.access_token;
  const t = await issueToken(creds);
  tokenCache.set(key, t);
  return t.access_token;
}

export function createPathaoClient(creds: PathaoCreds) {
  async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const doFetch = async (tok: string) =>
      fetchWithTimeout(`${creds.base_url}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
          ...(init.headers || {}),
        },
      });
    let res = await doFetch(await getToken(creds));
    if (res.status === 401) {
      tokenCache.delete(`${creds.base_url}::${creds.client_id}::${creds.username}`);
      res = await doFetch(await getToken(creds));
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      const msg = json?.message || json?.error || text || `Pathao error ${res.status}`;
      throw new Error(`Pathao ${path} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 240)}`);
    }
    return (json?.data ?? json) as T;
  }

  return {
    storeId: creds.store_id,
    cities: async () =>
      memo(`cities::${creds.base_url}::${creds.client_id}`, async () => {
        const d: any = await call("/aladdin/api/v1/city-list");
        return d?.data ?? d ?? [];
      }),
    zones: async (cityId: number) =>
      memo(`zones::${creds.base_url}::${creds.client_id}::${cityId}`, async () => {
        const d: any = await call(`/aladdin/api/v1/cities/${cityId}/zone-list`);
        return d?.data ?? d ?? [];
      }),
    areas: async (zoneId: number) =>
      memo(`areas::${creds.base_url}::${creds.client_id}::${zoneId}`, async () => {
        const d: any = await call(`/aladdin/api/v1/zones/${zoneId}/area-list`);
        return d?.data ?? d ?? [];
      }),
    price: (input: Record<string, unknown>) => call("/aladdin/api/v1/merchant/price-plan", { method: "POST", body: JSON.stringify(input) }),
    createOrder: (input: Record<string, unknown>) => call("/aladdin/api/v1/orders", { method: "POST", body: JSON.stringify(input) }),
    track: (consignmentId: string) => call(`/aladdin/api/v1/orders/${consignmentId}/info`),
  };
}

function envCreds(): PathaoCreds | null {
  const cid = process.env.PATHAO_CLIENT_ID;
  const cs = process.env.PATHAO_CLIENT_SECRET;
  const u = process.env.PATHAO_USERNAME;
  const p = process.env.PATHAO_PASSWORD;
  const sid = Number(process.env.PATHAO_STORE_ID);
  if (!cid || !cs || !u || !p || !sid) return null;
  return {
    base_url: process.env.PATHAO_BASE_URL || "https://api-hermes.pathao.com",
    client_id: cid, client_secret: cs, username: u, password: p, store_id: sid,
  };
}

export async function loadPathaoCreds(supabase: any, brandId?: string | null): Promise<PathaoCreds> {
  // Prefer service-role client so admin-only RLS on erp_courier_settings still
  // works for non-admin operations users. Fall back to the caller's client if
  // the service-role env isn't configured (dev/preview).
  let client: any = supabase;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      client = supabaseAdmin;
    } catch {
      // fall back to caller's client
    }
  }
  let q = client
    .from("erp_courier_settings")
    .select("brand_id, base_url, client_id, client_secret, username, password, store_id, is_active")
    .eq("provider", "pathao")
    .eq("is_active", true);
  if (brandId) q = q.eq("brand_id", brandId);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  if (data && data.client_id && data.client_secret && data.username && data.password && data.store_id) {
    return {
      base_url: data.base_url || "https://api-hermes.pathao.com",
      client_id: data.client_id,
      client_secret: data.client_secret,
      username: data.username,
      password: data.password,
      store_id: Number(data.store_id),
    };
  }
  const env = envCreds();
  if (env) return env;
  throw new Error("Pathao credentials are not configured. Add them in Courier → Settings.");
}