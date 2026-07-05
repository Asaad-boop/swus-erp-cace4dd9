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
        // Auth: accept either the Supabase anon key (pg_cron pattern) or the
        // optional CRON_SECRET header. `/api/public/*` bypasses edge auth, so
        // we still gate the endpoint here.
        const expected = process.env.CRON_SECRET;
        const anon =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnc3NwaXBramV1Y2VmdHVhdHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDcyMzIsImV4cCI6MjA5MTgyMzIzMn0.h6aRTBUhTvEvKCx8M-lvyA2BCBQbhvWMWKgn8dIyilc";
        const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const cronHeader = request.headers.get("x-cron-secret");
        const ok = (anon && apikey && apikey === anon) || (expected && cronHeader === expected);
        if (!ok) return new Response("Unauthorized", { status: 401 });

        let body: { brandId?: string; limit?: number } = {};
        try {
          body = await request.json();
        } catch {
          /* empty body OK */
        }
        const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);
        const candidateLimit = Math.min(Math.max(limit * 5, 100), 500);

        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = tryGetSupabaseAdmin();
        if (!supabaseAdmin) {
          return Response.json({ checked: 0, updated: 0, skipped: true, reason: "Supabase admin client unavailable" });
        }

        // Find in-flight orders that have any way to be tracked. We fetch a
        // wider candidate set, then process the stalest shipments first so a
        // small cron batch rotates instead of hammering the same rows forever.
        let q = supabaseAdmin
          .from("orders")
          .select("id,invoice_no,status,courier_name,tracking_number,brand_id,shipped_at")
          .in("status", ["ready_to_ship", "shipped", "in_transit"])
          .order("shipped_at", { ascending: true, nullsFirst: false })
          .limit(candidateLimit);
        if (body.brandId) q = q.eq("brand_id", body.brandId);
        const { data: orders, error: oErr } = await q;
        if (oErr) return Response.json({ checked: 0, updated: 0, error: oErr.message });
        if (!orders || orders.length === 0) return Response.json({ checked: 0, updated: 0 });

        const orderIds = orders.map((o) => o.id);
        const { data: shipments } = await supabaseAdmin
          .from("courier_shipments")
          .select("id, order_id, provider, consignment_id, tracking_code, status, created_at, updated_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });

        type ShipRow = {
          id: string;
          order_id: string;
          provider: string;
          consignment_id: string | null;
          tracking_code: string | null;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        const shipMap = new Map<string, ShipRow>();
        const isCancelled = (s: string | null) => !!s && /cancel|return/i.test(s);
        // Prefer active (non-cancelled) shipment per order; cancelled only as fallback.
        for (const s of (shipments ?? []) as ShipRow[]) {
          const existing = shipMap.get(s.order_id);
          if (!existing) {
            shipMap.set(s.order_id, s);
          } else if (isCancelled(existing.status) && !isCancelled(s.status)) {
            shipMap.set(s.order_id, s);
          }
        }
        const ordersToCheck = [...orders].sort((a, b) => {
          const as = shipMap.get(a.id);
          const bs = shipMap.get(b.id);
          const at = Date.parse(as?.updated_at ?? as?.created_at ?? a.shipped_at ?? "1970-01-01T00:00:00Z");
          const bt = Date.parse(bs?.updated_at ?? bs?.created_at ?? b.shipped_at ?? "1970-01-01T00:00:00Z");
          return at - bt;
        }).slice(0, limit);

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
        for (let i = 0; i < ordersToCheck.length; i += batchSize) {
          const batch = ordersToCheck.slice(i, i + batchSize);
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
                let responsePayload: any = null;
                if (provider === "pathao") {
                  if (!identifier) return;
                  const { loadPathaoCreds, createPathaoClient } = await import("@/lib/erp/pathao.server");
                  const creds = await loadPathaoCreds(supabaseAdmin, o.brand_id);
                  const client = createPathaoClient(creds);
                  const res: any = await client.track(identifier).catch(() => null);
                  if (!res) return;
                  responsePayload = res;
                  raw = res?.data?.order_status ?? res?.data?.status ?? null;
                } else {
                  const { loadSteadfastCreds, createSteadfastClient } = await import("@/lib/erp/steadfast.server");
                  const creds = await loadSteadfastCreds(supabaseAdmin, o.brand_id);
                  const client = createSteadfastClient(creds);
                  let res: any = null;
                  if (identifier) res = await client.trackByCid(identifier).catch(() => null);
                  if (!res && o.invoice_no) res = await client.trackByInvoice(o.invoice_no).catch(() => null);
                  if (!res) return;
                  responsePayload = res;
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
                if (ship?.id) {
                  const payload = responsePayload?.data ?? responsePayload ?? {};
                  const norm = normalizeCourierStatus(raw);
                  const isActiveDelivery = /assigned_for_delivery|on_delivery|out_for_delivery/.test(norm);
                  await supabaseAdmin
                    .from("courier_shipments")
                    .update({
                      status: raw,
                      response_payload: responsePayload,
                      rider_name: provider === "pathao" && isActiveDelivery ? (payload?.delivery_man_name ?? payload?.delivery_man?.name ?? null) : null,
                      rider_phone: provider === "pathao" && isActiveDelivery ? (payload?.delivery_man_phone ?? payload?.delivery_man?.phone ?? null) : null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", ship.id);
                }
                if (!mapped || mapped === o.status) return;

                const note = `${provider}: ${normalizeCourierStatus(raw)}`;
                const { error: uErr } = await supabaseAdmin.rpc("transition_order_status", {
                  _order_id: o.id,
                  _new_status: mapped,
                  _reason: "auto_cron_sync",
                  _note: note,
                });
                if (uErr) {
                  errors.push({ order_id: o.id, error: uErr.message });
                  return;
                }
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