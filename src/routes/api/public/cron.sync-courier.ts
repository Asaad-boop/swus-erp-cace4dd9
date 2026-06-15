import { createFileRoute } from "@tanstack/react-router";
import {
  mapCourierStatus,
  normalizeCourierStatus,
  type CourierProvider,
  type CourierStatusMappingOverrides,
} from "@/lib/erp/courier-status-mapping";

/**
 * Auto-sync courier status for in-flight orders.
 * Called by pg_cron. Auth: header `x-cron-secret` must equal env CRON_SECRET.
 * Body (optional): { brandId?: string, limit?: number }
 */
export const Route = createFileRoute("/api/public/cron/sync-courier")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response("Cron not configured", { status: 503 });
        }
        const provided = request.headers.get("x-cron-secret");
        if (!provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { brandId?: string; limit?: number } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body OK */
        }
        const limit = Math.min(Math.max(body.limit ?? 200, 1), 500);

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = tryGetSupabaseAdmin();
        if (!supabaseAdmin) {
          return Response.json({ checked: 0, updated: 0, skipped: true, reason: "Supabase admin client unavailable" });
        }

        // Find in-flight orders that have any way to be tracked
        let q = supabaseAdmin
          .from("orders")
          .select("id,invoice_no,status,courier_name,tracking_number,brand_id,shipped_at")
          .in("status", ["ready_to_ship", "shipped", "in_transit"])
          .order("shipped_at", { ascending: true, nullsFirst: false })
          .limit(limit);
        if (body.brandId) q = q.eq("brand_id", body.brandId);
        const { data: orders, error: oErr } = await q;
        if (oErr) return Response.json({ error: oErr.message }, { status: 500 });
        if (!orders || orders.length === 0) return Response.json({ checked: 0, updated: 0 });

        const orderIds = orders.map((o) => o.id);
        const { data: shipments } = await supabaseAdmin
          .from("courier_shipments")
          .select("id, order_id, provider, consignment_id, tracking_code, status, created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });

        const shipMap = new Map<string, { id: string; provider: string; consignment_id: string | null; tracking_code: string | null; status: string | null }>();
        const isCancelled = (s: string | null) => !!s && /cancel|return/i.test(s);
        // Prefer active (non-cancelled) shipment per order; cancelled only as fallback.
        for (const s of shipments ?? []) {
          const existing = shipMap.get(s.order_id);
          if (!existing) {
            shipMap.set(s.order_id, s);
          } else if (isCancelled(existing.status) && !isCancelled(s.status)) {
            shipMap.set(s.order_id, s);
          }
        }

        // Cache mapping per brand
        const mappingCache = new Map<string, CourierStatusMappingOverrides | null>();
        const loadMapping = async (brandId: string | null) => {
          if (!brandId) return null;
          if (mappingCache.has(brandId)) return mappingCache.get(brandId)!;
          const { data } = await supabaseAdmin
            .from("erp_settings")
            .select("config")
            .eq("brand_id", brandId)
            .maybeSingle();
          const m = ((data?.config as any)?.courier_status_mapping ?? null) as CourierStatusMappingOverrides | null;
          mappingCache.set(brandId, m);
          return m;
        };

        const pickProvider = (name: string | null): CourierProvider | null => {
          if (!name) return null;
          const n = name.toLowerCase();
          if (n.includes("pathao")) return "pathao";
          if (n.includes("steadfast") || n.includes("packzy")) return "steadfast";
          return null;
        };

        let checked = 0;
        let updated = 0;
        const errors: Array<{ order_id: string; error: string }> = [];

        const batchSize = 4;
        for (let i = 0; i < orders.length; i += batchSize) {
          const batch = orders.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (o) => {
              checked++;
              try {
                const ship = shipMap.get(o.id) ?? null;
                let provider: CourierProvider | null = null;
                let identifier: string | null = null;
                if (ship) {
                  provider = pickProvider(ship.provider);
                  identifier = ship.consignment_id ?? ship.tracking_code ?? null;
                }
                if (!provider || !identifier) {
                  provider = pickProvider(o.courier_name);
                  identifier = o.tracking_number ?? null;
                }
                if (!provider) return;

                let raw: string | null = null;
                if (provider === "pathao") {
                  if (!identifier) return;
                  const { loadPathaoCreds, createPathaoClient } = await import("@/lib/erp/pathao.server");
                  const creds = await loadPathaoCreds(supabaseAdmin, o.brand_id);
                  const client = createPathaoClient(creds);
                  const res: any = await client.track(identifier).catch(() => null);
                  if (!res) return;
                  raw = res?.data?.order_status ?? res?.data?.status ?? null;
                } else {
                  const { loadSteadfastCreds, createSteadfastClient } = await import("@/lib/erp/steadfast.server");
                  const creds = await loadSteadfastCreds(supabaseAdmin, o.brand_id);
                  const client = createSteadfastClient(creds);
                  let res: any = null;
                  if (identifier) res = await client.trackByCid(identifier).catch(() => null);
                  if (!res && o.invoice_no) res = await client.trackByInvoice(o.invoice_no).catch(() => null);
                  if (!res) return;
                  raw = res?.data?.delivery_status ?? res?.delivery_status ?? null;
                }

                if (!raw) return;
                const overrides = await loadMapping(o.brand_id);
                const mapped = mapCourierStatus(provider, raw, overrides);
                // If courier reports cancelled, drop the shipment row instead
                // of cancelling the order. Next run picks the next active one.
                if (/cancel/i.test(raw) && ship?.id) {
                  await supabaseAdmin.from("courier_shipments").delete().eq("id", ship.id);
                  return;
                }
                if (!mapped || mapped === o.status) return;

                const { error: uErr } = await supabaseAdmin
                  .from("orders")
                  .update({ status: mapped })
                  .eq("id", o.id);
                if (uErr) {
                  errors.push({ order_id: o.id, error: uErr.message });
                  return;
                }
                await supabaseAdmin.from("order_status_history").insert({
                  order_id: o.id,
                  from_status: o.status,
                  to_status: mapped,
                  reason: "auto_cron_sync",
                  note: `${provider}: ${normalizeCourierStatus(raw)}`,
                });
                updated++;
              } catch (e) {
                errors.push({ order_id: o.id, error: (e as Error).message });
              }
            }),
          );
        }

        return Response.json({ checked, updated, errors: errors.slice(0, 20) });
      },
    },
  },
});