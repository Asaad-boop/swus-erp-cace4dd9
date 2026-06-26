/**
 * In-built (offline) Pathao address matcher.
 *
 * Goal: address text theke (mixed Bangla/English, informal spelling)
 * Pathao-supported (city, zone, area) tuple ke AI chhara deterministic
 * vabe choose kora. Pathao API call kora hoy shudhu official list
 * fetch korte — match logic puro local.
 *
 * Strategy
 *  1. Normalize address: lowercase, punctuation strip, Bangla → Latin
 *     transliteration (location-friendly map), common alias replace.
 *  2. City: score whole cities list with token + substring scorer; keep
 *     top-3 candidates (city name onek somoy address e thake na, so
 *     fallback Dhaka).
 *  3. For each candidate city, fetch zones, score same way, keep top-3.
 *  4. For each (city, zone) pair, fetch areas, score, keep top-1.
 *  5. Combined score = w1*city + w2*zone + w3*area (zone weight highest –
 *     zone name address e thakar chance shob theke beshi). Best tuple win.
 */

export type MatchItem = { id: number; name: string };
export type MatchPick = { id: number; name: string; score: number } | null;

/* -------- Bangla → Latin transliteration (location-tuned) -------- */

const BN_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

// Conjunct / multi-char first (longest match wins)
const BN_MULTI: Array<[string, string]> = [
  ["ক্ষ", "kh"], ["জ্ঞ", "gg"], ["ঞ্চ", "nch"], ["ঞ্জ", "nj"],
  ["ঙ্গ", "ng"], ["ঙ্ক", "nk"], ["ন্ড", "nd"], ["ন্ট", "nt"],
  ["ন্ত", "nt"], ["ন্দ", "nd"], ["ম্ব", "mb"], ["ম্প", "mp"],
  ["শ্র", "shr"], ["স্ত", "st"], ["স্থ", "sth"], ["স্ট", "st"],
  ["ষ্ণ", "shn"], ["ষ্ঠ", "shth"], ["ত্র", "tr"], ["দ্র", "dr"],
  ["প্র", "pr"], ["ব্র", "br"], ["ক্র", "kr"], ["গ্র", "gr"],
  ["ছ্র", "chr"], ["চ্চ", "cch"], ["চ্ছ", "chh"], ["জ্জ", "jj"],
  ["ট্ট", "tt"], ["ড্ড", "dd"], ["ত্ত", "tt"], ["দ্দ", "dd"],
  ["ন্ন", "nn"], ["প্প", "pp"], ["ব্ব", "bb"], ["ম্ম", "mm"],
  ["ল্ল", "ll"], ["শ্শ", "shsh"], ["স্স", "ss"],
  ["্য", "y"], ["্র", "r"], ["্ব", "w"],
];

const BN_SINGLE: Record<string, string> = {
  "অ": "a", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u",
  "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
  "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
  "চ": "ch", "ছ": "ch", "জ": "j", "ঝ": "jh", "ঞ": "n",
  "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
  "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
  "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m",
  "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh",
  "স": "s", "হ": "h", "ড়": "r", "ঢ়": "rh", "য়": "y",
  "ৎ": "t", "ং": "ng", "ঃ": "h", "ঁ": "",
  // vowel signs
  "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri",
  "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou", "্": "",
};

function translitBangla(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (BN_DIGITS[ch]) { out += BN_DIGITS[ch]; i++; continue; }
    // Try multi-char
    let matched = false;
    for (const [bn, lat] of BN_MULTI) {
      if (s.startsWith(bn, i)) { out += lat; i += bn.length; matched = true; break; }
    }
    if (matched) continue;
    if (BN_SINGLE[ch] !== undefined) { out += BN_SINGLE[ch]; i++; continue; }
    out += ch; i++;
  }
  return out;
}

/* -------- Spelling aliases (post-transliteration normalisation) -------- */

const SPELLING_ALIASES: Array<[RegExp, string]> = [
  [/\bdhanmondi\b|\bdhanmandi\b|\bdhanmondhi\b/g, "dhanmondi"],
  [/\bgulshan\b|\bgulsan\b/g, "gulshan"],
  [/\bbanani\b/g, "banani"],
  [/\bmirpur\b/g, "mirpur"],
  [/\buttara\b|\butterra\b/g, "uttara"],
  [/\bbaridhara\b/g, "baridhara"],
  [/\bbashundhara\b|\bvasundhara\b|\bbosundhora\b/g, "bashundhara"],
  [/\bmohammadpur\b|\bmohammodpur\b/g, "mohammadpur"],
  [/\btejgaon\b|\btejgan\b/g, "tejgaon"],
  [/\bmotijheel\b|\bmotijhil\b/g, "motijheel"],
  [/\bpaltan\b/g, "paltan"],
  [/\bramna\b/g, "ramna"],
  [/\bkhilgaon\b|\bkhilghaon\b/g, "khilgaon"],
  [/\brampura\b/g, "rampura"],
  [/\bbadda\b/g, "badda"],
  [/\bjatrabari\b|\bjatrabadi\b|\bjattrabari\b/g, "jatrabari"],
  [/\bdemra\b/g, "demra"],
  [/\bkamrangirchar\b|\bkamrangir char\b/g, "kamrangirchar"],
  [/\blalbagh\b|\blalbag\b/g, "lalbagh"],
  [/\bkeraniganj\b|\bkeranigonj\b/g, "keraniganj"],
  [/\bsavar\b|\bsabar\b/g, "savar"],
  [/\bashulia\b|\bashuliya\b/g, "ashulia"],
  [/\btongi\b|\btongee\b/g, "tongi"],
  [/\bgazipur\b|\bgazipure\b/g, "gazipur"],
  [/\bnarayanganj\b|\bnarayangonj\b|\bn ganj\b/g, "narayanganj"],
  [/\bchattogram\b|\bchittagong\b|\bctg\b|\bctg\b/g, "chattogram"],
  [/\bcumilla\b|\bcumila\b|\bcunmilla\b|\bcomilla\b|\bcomila\b|\bkumilla\b|\bkumila\b/g, "cumilla"],
  [/\bsadar\b|\bsodor\b|\bsador\b|\bsader\b|\bsdr\b/g, "sadar"],
  [/\bsylhet\b|\bsylet\b/g, "sylhet"],
  [/\brajshahi\b|\brajsahi\b/g, "rajshahi"],
  [/\bkhulna\b/g, "khulna"],
  [/\bbarishal\b|\bbarisal\b/g, "barishal"],
  [/\brangpur\b/g, "rangpur"],
  [/\bmymensingh\b|\bmymensing\b/g, "mymensingh"],
  [/\bdhaka\b|\bdacca\b|\bdhakaa\b/g, "dhaka"],
];

function normalize(s: string): string {
  let out = translitBangla(s);
  out = out.toLowerCase();
  out = out.replace(/[।,.\-_/\\()[\]{}'"`!?:;|#+*=<>]/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  for (const [re, sub] of SPELLING_ALIASES) out = out.replace(re, sub);
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

/* -------- Scoring -------- */

function tokenize(s: string): string[] {
  return s.split(" ").filter((t) => t.length >= 2);
}

function tokenSet(s: string): Set<string> {
  return new Set(tokenize(normalize(s)));
}

function mergeTokenSets(...sets: Array<Set<string> | undefined>): Set<string> {
  const out = new Set<string>();
  for (const set of sets) for (const token of set ?? []) out.add(token);
  return out;
}

/**
 * Score how strongly `name` appears inside `addr` (both normalized).
 * - Whole-name word-boundary match: very high.
 * - Substring match: high (length-weighted).
 * - Per-token overlap: small boost.
 * Returns 0 when nothing useful matches.
 */
function scoreName(addr: string, name: string, opts: { ignoreTokens?: Set<string> } = {}): number {
  if (!name) return 0;
  const paddedAddr = ` ${addr} `;
  const paddedName = ` ${name} `;
  if (paddedAddr.includes(paddedName)) return name.length * 10 + 50;
  if (addr.includes(name)) return name.length * 6 + 10;
  const addrTokens = new Set(tokenize(addr));
  const nameTokens = tokenize(name);
  if (nameTokens.length === 0) return 0;
  let tokScore = 0;
  let hits = 0;
  let distinctiveHits = 0;
  for (const t of nameTokens) {
    const isIgnored = opts.ignoreTokens?.has(t) ?? false;
    if (addrTokens.has(t)) {
      tokScore += t.length * 3;
      hits++;
      if (!isIgnored) distinctiveHits++;
    }
    else if (addr.includes(t) && t.length >= 4) {
      tokScore += t.length;
      hits++;
      if (!isIgnored) distinctiveHits++;
    }
  }
  // Require majority of multi-token names to hit; cuts false positives
  if (nameTokens.length >= 2 && hits < Math.ceil(nameTokens.length / 2)) return 0;
  // Zone/area names often include the parent city (e.g. "Cumilla Cantonment").
  // Matching only that parent token caused wrong picks like "Cumilla Sadar" →
  // "Cumilla Cantonment" / "Comilla University". For hierarchical matching,
  // at least one non-parent token must be present unless the full phrase matched.
  if (nameTokens.length >= 2 && opts.ignoreTokens?.size && distinctiveHits === 0) return 0;
  return tokScore;
}

export function rankItems(
  addressRaw: string,
  items: MatchItem[],
  topN: number,
  opts: { ignoreTokens?: Set<string> } = {},
): Array<{ item: MatchItem; score: number }> {
  const addr = normalize(addressRaw);
  const scored = items
    .map((it) => ({ item: it, score: scoreName(addr, normalize(it.name), opts) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function bestMatch(addressRaw: string, items: MatchItem[]): MatchPick {
  const top = rankItems(addressRaw, items, 1);
  if (!top[0]) return null;
  return { id: top[0].item.id, name: top[0].item.name, score: top[0].score };
}

/* -------- Hierarchical joint search -------- */

export type HierLookup = {
  zones: (cityId: number) => Promise<MatchItem[]>;
  areas: (zoneId: number) => Promise<MatchItem[]>;
};

export type HierResult = {
  city: MatchItem | null;
  zone: MatchItem | null;
  area: MatchItem | null;
  confidence: number; // 0..1
};

/**
 * Pick best (city, zone, area) jointly by searching top city candidates and
 * scoring their zones/areas. Falls back to Dhaka when the city name itself
 * is not present in the address (very common — most customers omit "Dhaka").
 */
export async function detectHierarchy(opts: {
  address: string;
  cities: MatchItem[];
  lookup: HierLookup;
}): Promise<HierResult> {
  const { address, cities, lookup } = opts;

  // Step 1: top city candidates (+ Dhaka as implicit fallback)
  let cityCands = rankItems(address, cities, 3).map((c) => ({ item: c.item, base: c.score }));
  const dhaka = cities.find((c) => /dhaka/i.test(c.name));
  if (dhaka && !cityCands.some((c) => c.item.id === dhaka.id)) {
    cityCands.push({ item: dhaka, base: 1 }); // tiny base so explicit matches win
  }
  if (cityCands.length === 0) {
    // No signal at all; assume Dhaka if available, else give up.
    if (dhaka) cityCands = [{ item: dhaka, base: 1 }];
    else return { city: null, zone: null, area: null, confidence: 0 };
  }

  // Step 2: for each city, score zones; collect (city, zone) tuples
  type Combo = { city: MatchItem; zone: MatchItem | null; area: MatchItem | null; score: number };
  const combos: Combo[] = [];

  for (const c of cityCands) {
    let zones: MatchItem[] = [];
    try { zones = await lookup.zones(c.item.id); } catch { zones = []; }
    const cityTokens = tokenSet(c.item.name);
    const topZones = rankItems(address, zones, 3, { ignoreTokens: cityTokens });
    if (topZones.length === 0) {
      combos.push({ city: c.item, zone: null, area: null, score: c.base });
      continue;
    }
    for (const z of topZones) {
      let areas: MatchItem[] = [];
      try { areas = await lookup.areas(z.item.id); } catch { areas = []; }
      const topArea = rankItems(address, areas, 1, { ignoreTokens: mergeTokenSets(cityTokens, tokenSet(z.item.name)) })[0] ?? null;
      // Weights: zone matters most, then area, then city presence
      const score = c.base * 1 + z.score * 3 + (topArea?.score ?? 0) * 2;
      combos.push({ city: c.item, zone: z.item, area: topArea?.item ?? null, score });
    }
  }

  combos.sort((a, b) => b.score - a.score);
  const best = combos[0];
  if (!best) return { city: null, zone: null, area: null, confidence: 0 };

  // Confidence heuristic: zone match strongly drives confidence
  const conf = best.zone ? (best.area ? 0.95 : 0.8) : 0.4;
  return { city: best.city, zone: best.zone, area: best.area, confidence: conf };
}