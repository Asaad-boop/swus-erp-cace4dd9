import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/run-recurring")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("run_recurring_rules", { _brand_id: null } as never);
          if (error) throw error;
          return Response.json({ ok: true, result: data });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown error";
          if (/unavailable|SUPABASE_SERVICE_ROLE_KEY/i.test(msg)) {
            return Response.json({ ok: true, skipped: true, reason: msg });
          }
          console.error("[cron.run-recurring]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});