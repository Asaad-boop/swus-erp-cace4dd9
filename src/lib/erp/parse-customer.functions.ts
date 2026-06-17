import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function parseLocalCustomer(text: string) {
  const localPhone = (text.match(/(?:\+?88)?0?1[3-9]\d{8}/)?.[0] ?? "")
    .replace(/^\+?88/, "")
    .replace(/^(?!0)/, "0");
  const lines = text
    .split(/[\n,|]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const withoutPhone = text.replace(/(?:\+?88)?0?1[3-9]\d{8}/g, " ");
  const nameLine = lines.find((line) => !/\d{4,}/.test(line) && line.length <= 60) ?? "";
  const address = withoutPhone
    .split(/[\n|]+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== nameLine)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
  return { name: nameLine, phone: localPhone, address };
}

/**
 * AI-powered free-text customer info extractor.
 * Paste any messy block of text (Bangla/English mixed, multi-line),
 * returns { name, phone, address }.
 */
export const parseCustomerTextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ text: z.string().min(3).max(4000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const local = parseLocalCustomer(data.text);
    const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
    if (!apiKey) return local;
    const useGemini = !!process.env.GEMINI_API_KEY;

    const system =
      "You parse a customer shipping block (Bangla/English mixed, messy formatting) " +
      "and return STRICT JSON with three fields: name, phone, address. " +
      "Rules: " +
      "phone = a single 11-digit Bangladeshi mobile starting with 01; " +
      "name = customer's full name only (no salutations, no address); " +
      "address = the full delivery address as one clean line (district/thana/area + landmark + house/road if present), " +
      "without the name or phone. " +
      'Respond ONLY with JSON: {"name": string, "phone": string, "address": string}. ' +
      "Use empty string for any field you cannot confidently extract.";

    const url = useGemini
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    let json: any = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: useGemini ? "gemini-2.5-flash-lite" : "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: system },
            { role: "user", content: data.text },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });
      if (!res.ok) return local;
      json = await res.json();
    } catch {
      return local;
    }
    let parsed: { name?: string; phone?: string; address?: string } = {};
    try {
      parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }
    const phone = (parsed.phone || local.phone || "").replace(/\D/g, "").slice(-11);
    return {
      name: (parsed.name || local.name || "").trim(),
      phone: phone && phone.startsWith("1") ? "0" + phone : phone,
      address: (parsed.address || local.address || "").trim(),
    };
  });