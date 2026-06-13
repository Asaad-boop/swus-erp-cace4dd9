import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CACHE_TTL_HOURS = 24;

type ProviderResult = {
  name: string;
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

async function fetchFromBDCourier(phone: string): Promise<HistoryData> {
  const apiKey = process.env.BD_COURIER_API_KEY;
  if (!apiKey) throw new Error("BD_COURIER_API_KEY is not configured");

  const res = await fetch("https://bdcourier.com/api/courier-check", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ phone }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BD Courier ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  // BD Courier returns { courierData: { pathao: {...}, steadfast: {...}, redx: {...}, summary: {...} } }
  const courierData = (json.courierData ?? json) as Record<string, { total_parcel?: number; success_parcel?: number; cancelled_parcel?: number } | undefined>;

  const providerKeys = ["pathao", "steadfast", "redx", "paperfly"] as const;
  const labels: Record<string, string> = {
    pathao: "Pathao",
    steadfast: "Steadfast",
    redx: "RedX",
    paperfly: "Paperfly",
  };

  const providers: ProviderResult[] = providerKeys.map((k) => {
    const p = courierData[k] ?? {};
    const total = Number(p.total_parcel ?? 0);
    const success = Number(p.success_parcel ?? 0);
    const cancelled = Number(p.cancelled_parcel ?? 0);
    return { name: k, label: labels[k] ?? k, total, success, cancelled, ok: true };
  });

  const summary = {
    total: providers.reduce((s, p) => s + p.total, 0),
    success: providers.reduce((s, p) => s + p.success, 0),
    cancelled: providers.reduce((s, p) => s + p.cancelled, 0),
  };

  return {
    phone,
    found: summary.total > 0,
    fetched_at: new Date().toISOString(),
    providers,
    summary,
  };
}

async function getOneWithCache(
  supabase: any,
  phone: string,
  force: boolean,
): Promise<HistoryData> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
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

  try {
    const fresh = await fetchFromBDCourier(normalized);
    await supabase
      .from("courier_history_cache")
      .upsert({ phone: normalized, data: fresh, fetched_at: fresh.fetched_at }, { onConflict: "phone" });
    return fresh;
  } catch (err) {
    // Fall back to whatever cache we have, even if stale
    const { data: cached } = await supabase
      .from("courier_history_cache")
      .select("data")
      .eq("phone", normalized)
      .maybeSingle();
    if (cached?.data) return cached.data as HistoryData;
    return {
      phone: normalized,
      found: false,
      fetched_at: new Date().toISOString(),
      providers: [
        { name: "pathao", label: "Pathao", total: 0, success: 0, cancelled: 0, ok: false, error: (err as Error).message },
        { name: "steadfast", label: "Steadfast", total: 0, success: 0, cancelled: 0, ok: false, error: (err as Error).message },
      ],
      summary: { total: 0, success: 0, cancelled: 0 },
    };
  }
}

export const fetchCourierHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phones: z.array(z.string().min(3).max(20)).min(1).max(100),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const results: Record<string, HistoryData> = {};
    // sequential to avoid rate limits
    for (const phone of data.phones) {
      const normalized = normalizePhone(phone);
      if (!normalized) continue;
      results[phone] = await getOneWithCache(context.supabase, phone, !!data.force);
      results[normalized] = results[phone];
    }
    return { results };
  });