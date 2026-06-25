// Edge function: notify-order-telegram
// Routes order notifications to brand-specific Telegram chats.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

// Brand-wise chat routing. Falls back to TELEGRAM_CHAT_ID for unknown brands.
const BRAND_CHAT_MAP: Record<string, string | undefined> = {
  // HobbyShop
  "1f1f366d-ad85-4513-85ab-2dbb6b23c513":
    Deno.env.get("TELEGRAM_HOBBYSHOP_CHAT_ID") ?? Deno.env.get("TELEGRAM_CHAT_ID"),
  // Toyora
  "40abf6fa-404e-4c3f-b0df-f35c1535e95d":
    Deno.env.get("TELEGRAM_TOYORA_CHAT_ID"),
};

const BRAND_LABEL: Record<string, string> = {
  "1f1f366d-ad85-4513-85ab-2dbb6b23c513": "HobbyShop",
  "40abf6fa-404e-4c3f-b0df-f35c1535e95d": "Toyora",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtBDT(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `৳${v.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, invoice_no, brand_id, shipping_name, shipping_phone, guest_name, guest_phone, shipping_city, shipping_thana, shipping_address, total, subtotal, shipping_fee, payment_method, source, source_website, source_platform, utm_source, status, created_at, confirmed_by, assigned_to, user_id, order_items(name, quantity, unit_price)",
      )
      .eq("id", order_id)
      .single();

    if (error || !order) {
      console.error("order fetch failed", error);
      return new Response(JSON.stringify({ error: "order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brandId = order.brand_id as string | null;
    const chatId = brandId ? BRAND_CHAT_MAP[brandId] : undefined;
    const brandName = brandId ? (BRAND_LABEL[brandId] ?? "Order") : "Order";

    if (!BOT_TOKEN || !chatId) {
      console.warn("missing bot token or chat id", { brandId, hasToken: !!BOT_TOKEN, hasChat: !!chatId });
      return new Response(
        JSON.stringify({ skipped: true, reason: "no chat configured for brand" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Lookup creator name (staff who created/confirmed the order)
    let createdByName = "";
    const creatorId = order.confirmed_by || order.assigned_to || null;
    if (creatorId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", creatorId)
        .maybeSingle();
      createdByName = (prof?.display_name as string) || (prof?.email as string) || "";
    }
    if (!createdByName && order.source === "manual") createdByName = "ERP Staff";
    const isCustomerOrder = !createdByName;

    const items = (order.order_items ?? []) as Array<{
      name: string;
      quantity: number;
      unit_price: number;
    }>;

    const itemsText = items
      .map((it) => `• ${esc(it.name)} × ${it.quantity} — ${fmtBDT((it.unit_price ?? 0) * (it.quantity ?? 0))}`)
      .join("\n");

    const source =
      order.source_website || order.source_platform || order.utm_source || order.source || "direct";

    const lines = [
      `🛒 <b>New ${esc(brandName)} Order</b>`,
      `<b>#${esc(order.invoice_no ?? String(order.id).slice(0, 8))}</b>`,
      ``,
      `👤 ${esc(order.shipping_name ?? order.guest_name ?? "—")}  ·  📞 ${esc(order.shipping_phone ?? order.guest_phone ?? "—")}`,
      order.shipping_city || order.shipping_thana
        ? `📍 ${esc([order.shipping_thana, order.shipping_city].filter(Boolean).join(", "))}`
        : "",
      ``,
      itemsText || "<i>no items</i>",
      ``,
      `💰 Total: <b>${fmtBDT(order.total)}</b>`,
      `🚚 Shipping: ${fmtBDT(order.shipping_fee)}  ·  💳 ${esc(order.payment_method ?? "—")}`,
      `🌐 Source: ${esc(source)}  ·  Status: ${esc(order.status)}`,
      createdByName
        ? `🧑‍💼 Created by: <b>${esc(createdByName)}</b>`
        : `🌍 Created from: <b>Website (Customer)</b>`,
    ]
      .filter(Boolean)
      .join("\n");

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const tgJson = await tgRes.json();
    if (!tgRes.ok) {
      console.error("telegram send failed", tgJson);
      return new Response(JSON.stringify({ error: "telegram failed", detail: tgJson }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, brand: brandName, chat_id: chatId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-order-telegram error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});