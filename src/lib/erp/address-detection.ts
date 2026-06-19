import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* -------------------------------------------------------------------------- */
/*  Smart Bangladesh address detection                                        */
/*  Pipeline:                                                                 */
/*    1. Local instant match against 64 BD districts (no API call)            */
/*    2. Gemini Flash fallback via Lovable AI Gateway (3s timeout)            */
/*    3. DB lookup in bd_cities / bd_zones / bd_areas                         */
/*    4. sessionStorage cache (client side)                                   */
/* -------------------------------------------------------------------------- */

export type AddressDetectionResult = {
  city: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
  source: "local" | "ai" | "none";
  confidence: number;
};

/* ------- Stage 1: 64 BD districts (en + bn + common aliases) -------------- */

const DISTRICT_ALIASES: Record<string, string[]> = {
  // Dhaka division
  Dhaka: ["dhaka", "ঢাকা", "dacca"],
  Faridpur: ["faridpur", "ফরিদপুর"],
  Gazipur: ["gazipur", "গাজীপুর"],
  Gopalganj: ["gopalganj", "গোপালগঞ্জ"],
  Kishoreganj: ["kishoreganj", "কিশোরগঞ্জ"],
  Madaripur: ["madaripur", "মাদারীপুর"],
  Manikganj: ["manikganj", "মানিকগঞ্জ"],
  Munshiganj: ["munshiganj", "মুন্সিগঞ্জ"],
  Narayanganj: ["narayanganj", "নারায়ণগঞ্জ"],
  Narsingdi: ["narsingdi", "নরসিংদী"],
  Rajbari: ["rajbari", "রাজবাড়ী"],
  Shariatpur: ["shariatpur", "শরীয়তপুর"],
  Tangail: ["tangail", "টাঙ্গাইল"],
  // Chattogram division
  Chittagong: ["chittagong", "chattogram", "ctg", "চট্টগ্রাম"],
  Bandarban: ["bandarban", "বান্দরবান"],
  Brahmanbaria: ["brahmanbaria", "ব্রাহ্মণবাড়িয়া"],
  Chandpur: ["chandpur", "চাঁদপুর"],
  Cumilla: ["cumilla", "comilla", "কুমিল্লা"],
  "Cox's Bazar": ["cox's bazar", "coxs bazar", "cox bazar", "কক্সবাজার"],
  Feni: ["feni", "ফেনী"],
  Khagrachhari: ["khagrachhari", "khagrachari", "খাগড়াছড়ি"],
  Lakshmipur: ["lakshmipur", "laxmipur", "লক্ষ্মীপুর"],
  Noakhali: ["noakhali", "নোয়াখালী"],
  Rangamati: ["rangamati", "রাঙ্গামাটি"],
  // Rajshahi division
  Rajshahi: ["rajshahi", "রাজশাহী"],
  Bogura: ["bogura", "bogra", "বগুড়া"],
  Joypurhat: ["joypurhat", "জয়পুরহাট"],
  Naogaon: ["naogaon", "নওগাঁ"],
  Natore: ["natore", "নাটোর"],
  Chapainawabganj: ["chapainawabganj", "nawabganj", "চাঁপাইনবাবগঞ্জ"],
  Pabna: ["pabna", "পাবনা"],
  Sirajganj: ["sirajganj", "সিরাজগঞ্জ"],
  // Khulna division
  Khulna: ["khulna", "খুলনা"],
  Bagerhat: ["bagerhat", "বাগেরহাট"],
  Chuadanga: ["chuadanga", "চুয়াডাঙ্গা"],
  Jashore: ["jashore", "jessore", "যশোর"],
  Jhenaidah: ["jhenaidah", "ঝিনাইদহ"],
  Kushtia: ["kushtia", "কুষ্টিয়া"],
  Magura: ["magura", "মাগুরা"],
  Meherpur: ["meherpur", "মেহেরপুর"],
  Narail: ["narail", "নড়াইল"],
  Satkhira: ["satkhira", "সাতক্ষীরা"],
  // Barishal division
  Barishal: ["barishal", "barisal", "বরিশাল"],
  Barguna: ["barguna", "বরগুনা"],
  Bhola: ["bhola", "ভোলা"],
  Jhalokati: ["jhalokati", "ঝালকাঠি"],
  Patuakhali: ["patuakhali", "পটুয়াখালী"],
  Pirojpur: ["pirojpur", "পিরোজপুর"],
  // Sylhet division
  Sylhet: ["sylhet", "সিলেট"],
  Habiganj: ["habiganj", "হবিগঞ্জ"],
  Moulvibazar: ["moulvibazar", "মৌলভীবাজার"],
  Sunamganj: ["sunamganj", "সুনামগঞ্জ"],
  // Rangpur division
  Rangpur: ["rangpur", "রংপুর"],
  Dinajpur: ["dinajpur", "দিনাজপুর"],
  Gaibandha: ["gaibandha", "গাইবান্ধা"],
  Kurigram: ["kurigram", "কুড়িগ্রাম"],
  Lalmonirhat: ["lalmonirhat", "লালমনিরহাট"],
  Nilphamari: ["nilphamari", "নীলফামারী"],
  Panchagarh: ["panchagarh", "পঞ্চগড়"],
  Thakurgaon: ["thakurgaon", "ঠাকুরগাঁও"],
  // Mymensingh division
  Mymensingh: ["mymensingh", "ময়মনসিংহ"],
  Jamalpur: ["jamalpur", "জামালপুর"],
  Netrokona: ["netrokona", "নেত্রকোণা"],
  Sherpur: ["sherpur", "শেরপুর"],
};

function norm(s: string): string {
  return ` ${s.toLowerCase().replace(/[।,.\-_/\\()[\]{}'"`!?:;]/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Returns canonical district name (English) if found in the address. */
function matchDistrictLocal(address: string): string | null {
  const a = norm(address);
  let best: { name: string; score: number } | null = null;
  for (const [canonical, terms] of Object.entries(DISTRICT_ALIASES)) {
    for (const t of terms) {
      const padded = ` ${t.toLowerCase()} `;
      if (!a.includes(padded)) continue;
      const score = t.length; // longer alias = more specific
      if (!best || score > best.score) best = { name: canonical, score };
    }
  }
  return best?.name ?? null;
}

/* ------- Stage 2: Gemini Flash fallback ----------------------------------- */

type AiParsed = { city: string | null; thana: string | null; area: string | null };

async function aiParseAddress(address: string): Promise<AiParsed | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const useGemini = !!process.env.GEMINI_API_KEY;

  const url = useGemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const model = useGemini ? "gemini-1.5-flash" : "google/gemini-3-flash-preview";

  const prompt =
    "Bangladesh address theke শুধু city/district ar thana/upazila ber koro.\n" +
    "ONLY return JSON, nothing else:\n" +
    '{"city": "Dhaka", "thana": "Mirpur", "area": "Mirpur 10"}\n' +
    `Address: ${address}\n` +
    "If unsure return null. No explanation. JSON only.";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (!cleaned || cleaned.toLowerCase() === "null") return null;
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      city: typeof parsed.city === "string" ? parsed.city : null,
      thana: typeof parsed.thana === "string" ? parsed.thana : null,
      area: typeof parsed.area === "string" ? parsed.area : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------- Stage 3: DB lookup ---------------------------------------------- */

function tokens(address: string): string[] {
  const stop = new Set([
    "road","rd","house","hse","flat","floor","block","sector","lane","near","beside",
    "opposite","main","village","district","upazila","union","ward","bangladesh","bd",
  ]);
  return Array.from(new Set(
    address.toLowerCase()
      .replace(/[0-9#.,/\-()|:;]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !stop.has(t)),
  ));
}

/* ------- Server function -------------------------------------------------- */

export const detectAddressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ address: z.string().min(3).max(2000) }).parse(d))
  .handler(async ({ data, context }): Promise<AddressDetectionResult> => {
    const { supabase } = context;
    const address = data.address;

    // Stage 1: local instant city match
    let cityName = matchDistrictLocal(address);
    let source: AddressDetectionResult["source"] = cityName ? "local" : "none";
    let aiHints: AiParsed | null = null;

    // Stage 2: Gemini fallback only if local failed
    if (!cityName) {
      aiHints = await aiParseAddress(address);
      if (aiHints?.city) {
        cityName = aiHints.city;
        source = "ai";
      }
    }

    if (!cityName) {
      return { city: null, zone: null, area: null, source: "none", confidence: 0 };
    }

    // Stage 3: DB lookup — city
    const { data: cityRow } = await supabase
      .from("bd_cities")
      .select("id, name_en")
      .ilike("name_en", cityName)
      .eq("is_active", true)
      .maybeSingle();

    if (!cityRow) {
      return { city: null, zone: null, area: null, source, confidence: 0.4 };
    }

    const city = { id: cityRow.id, name: cityRow.name_en };
    const addrTokens = new Set(tokens(address));
    const aiZoneHint = aiHints?.thana?.toLowerCase().trim() ?? null;
    const aiAreaHint = aiHints?.area?.toLowerCase().trim() ?? null;

    // Zones in city
    const { data: zoneRows } = await supabase
      .from("bd_zones")
      .select("id, name_en")
      .eq("city_id", city.id)
      .eq("is_active", true);

    let zone: { id: string; name: string } | null = null;
    if (zoneRows?.length) {
      const scored = zoneRows.map((z) => {
        const n = z.name_en.toLowerCase();
        let s = 0;
        if (aiZoneHint && (n === aiZoneHint || n.includes(aiZoneHint))) s += 100;
        if (addrTokens.has(n)) s += 80;
        const first = n.split(/\s+/)[0];
        if (first && addrTokens.has(first)) s += 50;
        return { hit: { id: z.id, name: z.name_en }, score: s };
      }).sort((a, b) => b.score - a.score);
      if (scored[0]?.score >= 50) zone = scored[0].hit;
    }

    let area: { id: string; name: string } | null = null;
    if (zone) {
      const { data: areaRows } = await supabase
        .from("bd_areas")
        .select("id, name_en")
        .eq("zone_id", zone.id)
        .eq("is_active", true);
      if (areaRows?.length) {
        const scored = areaRows.map((a) => {
          const n = a.name_en.toLowerCase();
          let s = 0;
          if (aiAreaHint && (n === aiAreaHint || n.includes(aiAreaHint))) s += 100;
          if (addrTokens.has(n)) s += 80;
          const first = n.split(/\s+/)[0];
          if (first && addrTokens.has(first)) s += 50;
          return { hit: { id: a.id, name: a.name_en }, score: s };
        }).sort((a, b) => b.score - a.score);
        if (scored[0]?.score >= 50) area = scored[0].hit;
      }
    }

    return {
      city,
      zone,
      area,
      source,
      confidence: source === "local" ? 0.95 : 0.8,
    };
  });

/* ------- Client cache wrapper -------------------------------------------- */

function hashAddr(s: string): string {
  let h = 0;
  const t = s.trim().toLowerCase();
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * Browser-side helper: caches detection results in sessionStorage so the same
 * address is resolved instantly on subsequent calls. Pass the server-fn caller
 * obtained via `useServerFn(detectAddressFn)`.
 */
export async function detectAddressCached(
  call: (args: { data: { address: string } }) => Promise<AddressDetectionResult>,
  address: string,
): Promise<AddressDetectionResult> {
  const trimmed = address.trim();
  const key = `addr_cache_${hashAddr(trimmed)}`;
  if (typeof window !== "undefined") {
    try {
      const cached = window.sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached) as AddressDetectionResult;
    } catch {/* ignore */}
  }
  const result = await call({ data: { address: trimmed } });
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(key, JSON.stringify(result)); } catch {/* ignore */}
  }
  return result;
}