// Server-only Steadfast (Packzy) API client.
// Imported lazily inside server function handlers — never from client code.

export type SteadfastCreds = {
  base_url: string;
  api_key: string;
  secret_key: string;
};

export function createSteadfastClient(creds: SteadfastCreds) {
  async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${creds.base_url}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Api-Key": creds.api_key,
        "Secret-Key": creds.secret_key,
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      const msg = json?.message || json?.error || text || `Steadfast error ${res.status}`;
      throw new Error(`Steadfast ${path} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 240)}`);
    }
    return json as T;
  }

  return {
    balance: () => call("/get_balance"),
    createOrder: (input: {
      invoice: string;
      recipient_name: string;
      recipient_phone: string;
      recipient_address: string;
      cod_amount: number;
      note?: string;
      item_description?: string;
    }) => call("/create_order", { method: "POST", body: JSON.stringify(input) }),
    trackByCid: (cid: string) => call(`/status_by_cid/${encodeURIComponent(cid)}`),
    trackByInvoice: (invoice: string) => call(`/status_by_invoice/${encodeURIComponent(invoice)}`),
  };
}

function envCreds(): SteadfastCreds | null {
  const k = process.env.STEADFAST_API_KEY;
  const s = process.env.STEADFAST_SECRET_KEY;
  if (!k || !s) return null;
  return {
    base_url: process.env.STEADFAST_BASE_URL || "https://portal.packzy.com/api/v1",
    api_key: k,
    secret_key: s,
  };
}

export async function loadSteadfastCreds(supabase: any, brandId?: string | null): Promise<SteadfastCreds> {
  let q = supabase
    .from("erp_courier_settings")
    .select("brand_id, base_url, client_id, client_secret, is_active")
    .eq("provider", "steadfast")
    .eq("is_active", true);
  if (brandId) q = q.eq("brand_id", brandId);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  if (data && data.client_id && data.client_secret) {
    return {
      base_url: data.base_url || "https://portal.packzy.com/api/v1",
      api_key: data.client_id,
      secret_key: data.client_secret,
    };
  }
  const env = envCreds();
  if (env) return env;
  throw new Error("Steadfast credentials are not configured. Add them in Courier → Settings.");
}