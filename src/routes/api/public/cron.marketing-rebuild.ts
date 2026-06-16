import { createFileRoute } from "@tanstack/react-router";

/**
 * Hourly cron: rebuild attribution + profit snapshots for last 2 days, all active brands.
 * Auth: apikey header == VITE_SUPABASE_PUBLISHABLE_KEY (Supabase anon).
 */
export const Route = createFileRoute("/api/public/cron/marketing-rebuild")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected) {
          return Response.json({ ok: false, skipped: true, reason: "Anon key not configured" });
        }
        if (provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { brand_id?: string; days?: number } = {};
        try {
          body = await request.json();
        } catch {}

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const days = Math.min(Math.max(body.days ?? 2, 1), 14);

        const results: any[] = [];
        if (body.brand_id) {
          const { data, error } = await supabaseAdmin.rpc("mkt_rebuild_window", {
            p_brand_id: body.brand_id,
            p_days: days,
            p_trigger: "cron",
          });
          const { data: post } = await supabaseAdmin.rpc("mkt_post_meta_spend_window", {
            p_brand_id: body.brand_id,
            p_days: days,
            p_force: false,
          });
          results.push({ brand_id: body.brand_id, rebuild: data, post, error: error?.message });
        } else {
          const { data: brands, error: bErr } = await supabaseAdmin
            .from("brands")
            .select("id, name")
            .eq("is_active", true);
          if (bErr) return Response.json({ ok: false, error: bErr.message }, { status: 500 });
          for (const b of brands ?? []) {
            const { data, error } = await supabaseAdmin.rpc("mkt_rebuild_window", {
              p_brand_id: b.id,
              p_days: days,
              p_trigger: "cron",
            });
            const { data: post } = await supabaseAdmin.rpc("mkt_post_meta_spend_window", {
              p_brand_id: b.id,
              p_days: days,
              p_force: false,
            });
            results.push({ brand_id: b.id, brand_name: b.name, rebuild: data, post, error: error?.message });
          }
        }

        return Response.json({ ok: true, days, results });
      },
    },
  },
});