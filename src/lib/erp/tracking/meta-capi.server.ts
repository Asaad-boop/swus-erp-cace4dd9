import { createHash } from "crypto";

const GRAPH_VERSION = "v21.0";

export function sha256Lower(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const v = String(value).trim().toLowerCase();
  if (!v) return undefined;
  return createHash("sha256").update(v).digest("hex");
}

export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return undefined;
  // BD default: strip leading 0, prepend 880
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "880" + digits.slice(1);
  if (digits.length === 10) return "880" + digits;
  return digits;
}

export type CapiEvent = {
  event_name: string;
  event_time: number;            // unix seconds
  event_id?: string;
  event_source_url?: string;
  action_source?: "website" | "system_generated" | "physical_store" | "chat" | "email";
  user_data: {
    em?: string[];               // hashed
    ph?: string[];               // hashed
    fbp?: string;
    fbc?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    external_id?: string[];
  };
  custom_data?: Record<string, unknown>;
};

export async function sendCapi(opts: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  events: CapiEvent[];
}): Promise<{ ok: boolean; status: number; body: unknown; events_received?: number; fbtrace_id?: string; error?: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(opts.pixelId)}/events`;
  const payload: Record<string, unknown> = {
    data: opts.events,
    access_token: opts.accessToken,
  };
  if (opts.testEventCode) payload.test_event_code = opts.testEventCode;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return {
        ok: false,
        status: res.status,
        body,
        error: body?.error?.message ?? `HTTP ${res.status}`,
        fbtrace_id: body?.fbtrace_id,
      };
    }
    return {
      ok: true,
      status: res.status,
      body,
      events_received: body?.events_received,
      fbtrace_id: body?.fbtrace_id,
    };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: (e as Error).message };
  }
}

export function resolveCapiToken(secretName: string | null | undefined): string | undefined {
  if (!secretName) return undefined;
  const v = process.env[secretName];
  return v && v.length > 0 ? v : undefined;
}