import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint — pulls last 3 days of Meta insights for every active ad account,
 * plus a structure refresh once per call. Public route, no auth required.
 * Schedule with pg_cron.
 */
export const Route = createFileRoute("/api/public/cron/sync-marketing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: allow either x-cron-secret (legacy) or Supabase apikey header
        // (pg_cron canonical pattern). /api/public/* already bypasses edge auth.
        const cronSecret = request.headers.get('x-cron-secret');
        const apikey = request.headers.get('apikey');
        const expectedSecret = process.env.CRON_SECRET;
        const expectedApiKey =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const ok =
          (expectedSecret && cronSecret === expectedSecret) ||
          (expectedApiKey && apikey === expectedApiKey);
        if (!ok) {
          return new Response('Unauthorized', { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runStructureSync, runInsightsSync } = await import(
          "@/lib/erp/marketing/sync.server"
        );

        const { data: accounts, error } = await supabaseAdmin
          .from("mkt_ad_accounts")
          .select("id,name,brand_id")
          .eq("status", "active");
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{
          account_id: string;
          name: string;
          structure?: { ok: boolean; rows?: number; error?: string };
          insights?: { ok: boolean; rows?: number; error?: string };
          finance?: any;
        }> = [];

        for (const acc of accounts ?? []) {
          const out: (typeof results)[number] = { account_id: acc.id, name: acc.name };
          try {
            const r = await runStructureSync(supabaseAdmin, acc.id);
            out.structure = { ok: true, rows: r.rows };
          } catch (e: any) {
            out.structure = { ok: false, error: String(e?.message ?? e) };
          }
          try {
            const r = await runInsightsSync(supabaseAdmin, acc.id, { days: 3 });
            out.insights = { ok: true, rows: r.rows };
            out.finance = (r as any)?.meta?.finance ?? null;
          } catch (e: any) {
            out.insights = { ok: false, error: String(e?.message ?? e) };
          }
          results.push(out);
        }

        return Response.json({
          ok: true,
          accounts: results.length,
          results,
          finished_at: new Date().toISOString(),
        });
      },
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger marketing sync" }),
    },
  },
});
