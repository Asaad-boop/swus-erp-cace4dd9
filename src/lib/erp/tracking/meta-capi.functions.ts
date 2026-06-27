import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrackingConfig = {
  brand_id: string;
  pixel_id: string | null;
  capi_enabled: boolean;
  test_event_code: string | null;
  enabled_events: Record<string, boolean>;
  token_secret_name: string | null;
  token_present: boolean;
  updated_at: string | null;
};

const DEFAULT_EVENTS = {
  PageView: true,
  ViewContent: true,
  AddToCart: true,
  InitiateCheckout: true,
  Purchase: true,
};

/** All brand tracking configs + per-brand 24h status. */
export const getBrandTrackingConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: brands, error: be } = await supabase
      .from("brands")
      .select("id,name,slug")
      .order("name");
    if (be) throw new Error(be.message);

    const { data: cfgs } = await supabase
      .from("meta_tracking_config")
      .select("*");

    const byBrand = new Map<string, any>();
    (cfgs ?? []).forEach((c: any) => byBrand.set(c.brand_id, c));

    // 24h status per brand
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: logs } = await supabase
      .from("meta_capi_log")
      .select("brand_id,status,event_name,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    const status = new Map<string, {
      total: number; ok: number; error: number; last_at: string | null; last_event: string | null;
    }>();
    (logs ?? []).forEach((l: any) => {
      const s = status.get(l.brand_id) ?? { total: 0, ok: 0, error: 0, last_at: null, last_event: null };
      s.total++;
      if (l.status === "ok") s.ok++; else s.error++;
      if (!s.last_at || l.created_at > s.last_at) { s.last_at = l.created_at; s.last_event = l.event_name; }
      status.set(l.brand_id, s);
    });

    return (brands ?? []).map((b: any) => {
      const c = byBrand.get(b.id);
      const tokenName = c?.token_secret_name ?? null;
      const tokenPresent = tokenName ? Boolean(process.env[tokenName]) : false;
      const st = status.get(b.id) ?? { total: 0, ok: 0, error: 0, last_at: null, last_event: null };
      return {
        brand: { id: b.id, name: b.name, slug: b.slug },
        config: {
          brand_id: b.id,
          pixel_id: c?.pixel_id ?? null,
          capi_enabled: c?.capi_enabled ?? false,
          test_event_code: c?.test_event_code ?? null,
          enabled_events: c?.enabled_events ?? DEFAULT_EVENTS,
          token_secret_name: tokenName,
          token_present: tokenPresent,
          updated_at: c?.updated_at ?? null,
        } as TrackingConfig,
        status: st,
      };
    });
  });

export const saveBrandTrackingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brand_id: string;
    pixel_id: string | null;
    capi_enabled: boolean;
    test_event_code: string | null;
    enabled_events: Record<string, boolean>;
    token_secret_name: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_tracking_config")
      .upsert({
        brand_id: data.brand_id,
        pixel_id: data.pixel_id?.trim() || null,
        capi_enabled: data.capi_enabled,
        test_event_code: data.test_event_code?.trim() || null,
        enabled_events: data.enabled_events,
        token_secret_name: data.token_secret_name?.trim() || null,
      }, { onConflict: "brand_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendCapiTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cfg, error } = await supabase
      .from("meta_tracking_config")
      .select("*")
      .eq("brand_id", data.brand_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cfg?.pixel_id) throw new Error("Pixel ID not set for this brand");
    if (!cfg.token_secret_name) throw new Error("CAPI token secret name not set");

    const { sendCapi, resolveCapiToken, sha256Lower } = await import("./meta-capi.server");
    const token = resolveCapiToken(cfg.token_secret_name);
    if (!token) throw new Error(`Secret "${cfg.token_secret_name}" not configured`);

    const eventId = `test-${data.brand_id}-${Date.now()}`;
    const res = await sendCapi({
      pixelId: cfg.pixel_id,
      accessToken: token,
      testEventCode: cfg.test_event_code ?? undefined,
      events: [{
        event_name: "PageView",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: {
          external_id: [sha256Lower(userId)!],
        },
        custom_data: { source: "erp_test_button" },
      }],
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("meta_capi_log").insert({
      brand_id: data.brand_id,
      event_name: "PageView",
      event_id: eventId,
      status: res.ok ? "ok" : "error",
      events_received: res.events_received ?? null,
      fbtrace_id: res.fbtrace_id ?? null,
      response: res.body as any,
      error: res.error ?? null,
      source: "test",
    });

    return res;
  });

export const getCapiRecentLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id?: string; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meta_capi_log")
      .select("id,brand_id,event_name,event_id,status,events_received,fbtrace_id,error,source,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 50, 200));
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** UTM/source breakdown for orders (per brand, time window). */
export const getUtmBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id?: string; days?: number }) => d)
  .handler(async ({ data, context }) => {
    const days = Math.min(Math.max(data.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let q = context.supabase
      .from("orders")
      .select("id,brand_id,total,attribution,source_website,created_at")
      .gte("created_at", since)
      .limit(5000);
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    type Row = {
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
      orders: number;
      revenue: number;
      has_fbclid: number;
    };
    const map = new Map<string, Row>();
    let captured = 0;
    let fbclidCaptured = 0;
    (rows ?? []).forEach((o: any) => {
      const a = o.attribution ?? {};
      const src = (a.utm_source ?? o.source_website ?? "(none)").toString().toLowerCase();
      const med = (a.utm_medium ?? "(none)").toString().toLowerCase();
      const camp = (a.utm_campaign ?? "(none)").toString().toLowerCase();
      const fbclid = Boolean(a.fbclid || a.fbc);
      if (a.utm_source || a.fbclid) captured++;
      if (fbclid) fbclidCaptured++;
      const key = `${src}|${med}|${camp}`;
      const r = map.get(key) ?? { utm_source: src, utm_medium: med, utm_campaign: camp, orders: 0, revenue: 0, has_fbclid: 0 };
      r.orders++;
      r.revenue += Number(o.total ?? 0);
      if (fbclid) r.has_fbclid++;
      map.set(key, r);
    });
    const breakdown = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    return {
      total_orders: rows?.length ?? 0,
      captured_attribution: captured,
      captured_fbclid: fbclidCaptured,
      breakdown,
    };
  });