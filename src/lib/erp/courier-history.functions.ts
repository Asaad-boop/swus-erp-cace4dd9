import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CACHE_TTL_HOURS = 24;

type ProviderResult = {
  name: "pathao" | "steadfast";
  label: string;
  total: number;
  success: number;
  cancelled: number;
  ok: boolean;
  error?: string;
};

type HistoryData = {
  phone: string;
  found: boolean;
  fetched_at: string;
  providers: ProviderResult[];
  summary: { total: number; success: number; cancelled: number };
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return digits;
}

async function fetchPathao(supabase: any, brandId: string | null, phone: string): Promise<ProviderResult> {
  try {
    const { loadPathaoCreds } = await import("./pathao.server");
    const creds = await loadPathaoCreds(supabase, brandId);

    // Get token via Pathao's standard issue-token flow
    const tokenRes = await fetch(`${creds.base_url}/aladdin/api/v1/issue-token`, {
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
    if (!tokenRes.ok) throw new Error(`auth ${tokenRes.status}`);
    const tokenJson = (await tokenRes.json()) as { access_token?: string; data?: { access_token?: string } };
    const token = tokenJson.access_token || tokenJson.data?.access_token;
    if (!token) throw new Error("auth: no access_token");

    // Customer success-rate lookup by phone (Pathao merchant portal endpoint)
    const res = await fetch("https://merchant.pathao.com/api/v1/user/success", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 120)}`);
    const j = JSON.parse(text);
    const c = j?.data?.customer ?? j?.customer ?? j?.data ?? {};
    const total = Number(c.total_delivery ?? c.total ?? 0);
    const success = Number(c.successful_delivery ?? c.success ?? 0);
    const cancelled = Math.max(0, total - success);
    return { name: "pathao", label: "Pathao", ok: true, total, success, cancelled };
  } catch (e) {
    return { name: "pathao", label: "Pathao", ok: false, total: 0, success: 0, cancelled: 0, error: (e as Error).message };
  }
}

async function fetchSteadfast(supabase: any, brandId: string | null, phone: string): Promise<ProviderResult> {
  try {
    const { loadSteadfastCreds } = await import("./steadfast.server");
    const creds = await loadSteadfastCreds(supabase, brandId);
    const res = await fetch(`${creds.base_url}/fraud_check/${encodeURIComponent(phone)}`, {
      method: "GET",
      headers: {
        "Api-Key": creds.api_key,
        "Secret-Key": creds.secret_key,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 120)}`);
    const j = JSON.parse(text);
    const total = Number(j.total_parcels ?? j.total_consignments ?? j.total ?? 0);
    const success = Number(j.total_delivered ?? j.successful_consignments ?? j.success ?? 0);
    const cancelled = Number(j.total_cancelled ?? j.cancelled_consignments ?? j.cancelled ?? Math.max(0, total - success));
    return { name: "steadfast", label: "Steadfast", ok: true, total, success, cancelled };
  } catch (e) {
    return { name: "steadfast", label: "Steadfast", ok: false, total: 0, success: 0, cancelled: 0, error: (e as Error).message };
  }
}

async function getOneWithCache(
  supabase: any,
  brandId: string | null,
  phone: string,
  force: boolean,
): Promise<HistoryData> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 11) {
    return {
      phone,
      found: false,
      fetched_at: new Date().toISOString(),
      providers: [],
      summary: { total: 0, success: 0, cancelled: 0 },
    };
  }

  if (!force) {
    const { data: cached } = await supabase
      .from("courier_history_cache")
      .select("data, fetched_at")
      .eq("phone", normalized)
      .maybeSingle();
    if (cached?.data && cached.fetched_at) {
      const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000;
      if (ageHours < CACHE_TTL_HOURS) return cached.data as HistoryData;
    }
  }

  const [pathao, steadfast] = await Promise.all([
    fetchPathao(supabase, brandId, normalized),
    fetchSteadfast(supabase, brandId, normalized),
  ]);
  const providers: ProviderResult[] = [pathao, steadfast];
  const summary = {
    total: providers.filter((p) => p.ok).reduce((s, p) => s + p.total, 0),
    success: providers.filter((p) => p.ok).reduce((s, p) => s + p.success, 0),
    cancelled: providers.filter((p) => p.ok).reduce((s, p) => s + p.cancelled, 0),
  };
  const fresh: HistoryData = {
    phone: normalized,
    found: summary.total > 0,
    fetched_at: new Date().toISOString(),
    providers,
    summary,
  };
  // Only cache if at least one provider succeeded
  if (providers.some((p) => p.ok)) {
    await supabase
      .from("courier_history_cache")
      .upsert({ phone: normalized, data: fresh, fetched_at: fresh.fetched_at }, { onConflict: "phone" });
  }
  return fresh;
}

export const fetchCourierHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phones: z.array(z.string().min(3).max(20)).min(1).max(100),
        brandId: z.string().uuid().optional(),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const results: Record<string, HistoryData> = {};
    const brandId = data.brandId ?? null;
    // Run in small parallel batches to keep latency low without hammering APIs
    const batchSize = 4;
    for (let i = 0; i < data.phones.length; i += batchSize) {
      const batch = data.phones.slice(i, i + batchSize);
      const settled = await Promise.all(
        batch.map(async (phone) => ({ phone, hist: await getOneWithCache(context.supabase, brandId, phone, !!data.force) })),
      );
      settled.forEach(({ phone, hist }) => {
        results[phone] = hist;
        results[normalizePhone(phone)] = hist;
      });
    }
    return { results };
  });