import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

async function sha256(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/mkt/track")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const siteKey = String(body.site_key ?? "");
        const sessionId = String(body.session_id ?? "");
        const eventName = String(body.event ?? "page_view");
        if (!siteKey || !sessionId) return json({ ok: false, error: "missing_fields" }, 400);

        const origin = request.headers.get("origin");
        const ua = request.headers.get("user-agent") ?? "";
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "";
        const [uaHash, ipHash] = await Promise.all([
          ua ? sha256(ua) : Promise.resolve(null),
          ip ? sha256(ip) : Promise.resolve(null),
        ]);

        const payload = {
          ...(body.payload ?? {}),
          ua_hash: uaHash,
          ip_hash: ipHash,
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("mkt_ingest_track", {
          p_site_key: siteKey,
          p_origin: origin,
          p_session_id: sessionId,
          p_event_name: eventName,
          p_payload: payload,
        });
        if (error) return json({ ok: false, error: error.message }, 500);
        return json(data ?? { ok: true });
      },
    },
  },
});