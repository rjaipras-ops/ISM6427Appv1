// AI search: turns a typed request ("big yard for dogs near the beach under 600k, no HOA") into
// the site's filters with Google's Gemini API. The model only translates the sentence; results
// still come from the MLS index. Everything it returns is checked against a whitelist here.
//
// Environment (Netlify):
//   GEMINI_API_KEY   required. Without it the endpoint answers 503 and the site uses its
//                    built-in phrase search (js/nlsearch.js) on its own.
//   GEMINI_MODEL     optional model override.
//   AI_SEARCH_DAILY_LIMIT / AI_SEARCH_PER_VISITOR  optional caps (defaults below).

import { createHash } from "node:crypto";
import { getJSON, setJSON } from "./store.mjs";

const MODELS = () => [process.env.GEMINI_MODEL, "gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"].filter(Boolean);
const DAILY_LIMIT = () => Number(process.env.AI_SEARCH_DAILY_LIMIT) || 800;
const PER_VISITOR = () => Number(process.env.AI_SEARCH_PER_VISITOR) || 30; // per day

const HOME_TYPES = ["Single Family", "Condo", "Townhouse", "Multi-Family", "Mobile/Manufactured", "Land"];
const BOOLS = ["reviewedOnly", "openHouse", "priceReduced", "newConstruction", "foreclosure", "virtualTour", "hideSenior",
  "pool", "waterfront", "view", "fireplace", "centralAir", "basement", "gated", "solar", "ev",
  "impactWindows", "boatDock", "oceanAccess", "golf", "noFloodZone", "cbs", "str", "statusPending"];
const NUMS = { priceMin: [1000, 5e8], priceMax: [1000, 5e8], payMax: [200, 5e5], bedsMin: [1, 10], bathsMin: [1, 10],
  sqftMin: [100, 1e5], sqftMax: [100, 1e5], lotMin: [100, 5e7], lotMax: [100, 5e7], yearMin: [1850, 2100], yearMax: [1850, 2100],
  hoaMax: [0, 1e5], garageMin: [1, 10], domMax: [1, 365] };
const SORTS = ["relevant", "newest", "priceAsc", "priceDesc", "ppsf", "sqft", "lot", "rating", "reviews"];

export const aiSearchEnabled = () => Boolean(process.env.GEMINI_API_KEY);

const INSTRUCTIONS = `You convert a home buyer's search request into filters for a South Florida real estate site. Reply with ONE JSON object and nothing else.

Allowed keys (omit any that the request doesn't mention; never guess):
- "q": a city, ZIP code or neighborhood name the buyer named (string). Not a county.
- "counties": array of county names without the word County, e.g. ["Broward"], ["Miami-Dade"], ["Palm Beach"].
- "types": array from ${JSON.stringify(HOME_TYPES)}. "house" means Single Family. Omit if the buyer just says "home" or "listing".
- "priceMin", "priceMax": dollars (numbers). "under 500k" -> priceMax 500000.
- "payMax": maximum total monthly payment in dollars.
- "bedsMin", "bathsMin": minimum counts (whole numbers).
- "sqftMin", "sqftMax": living area in square feet.
- "lotMin", "lotMax": lot size in square feet (1 acre = 43560). "big yard" -> lotMin 10000.
- "yearMin", "yearMax": year built.
- "hoaMax": maximum monthly HOA fee in dollars. "no HOA" -> 0. "low HOA" -> 300.
- "garageMin": minimum garage spaces.
- "stories": "single" or "multi".
- "domMax": listed within this many days (1, 7, 14 or 30).
- true/false features, set to true only when the buyer asks for them: ${BOOLS.join(", ")}.
  Meanings: hideSenior = exclude 55+ communities; noFloodZone = not in a flood zone; cbs = concrete block construction; str = short-term rentals allowed; ev = EV charging; view = has a view; reviewedOnly = has tour reviews; statusPending = include pending listings.
- "sort": one of ${JSON.stringify(SORTS)} (priceAsc = cheapest first, sqft = largest first).
- "keyword": ONE or TWO words to look for in listing descriptions, for the single most important wish that no filter covers. Every word must appear in the description, so choose the plainest distinctive word a listing agent would write: "fenced" (not "fenced yard"), "renovated" or "updated" (not "updated kitchen"), "in-law", "corner lot". Use only one wish here; put any other such wishes in "unsupported".
- "unsupported": array of short phrases for parts of the request you could not turn into a filter or keyword (e.g. "no pool", "near good schools", "close to my office").
- "declined": true if any part of the request is about who lives in an area or about safety (race, ethnicity, religion, nationality, sex, family status, disability, age of neighbors, crime, "safe"). Never create a filter or keyword for those parts; still fill in the rest.

Rules: the site can require a feature but cannot exclude one, so "no pool" goes in "unsupported". If you created a filter or keyword for a wish, do NOT also list that wish in "unsupported". Only set lotMin when the buyer gives a size or clearly asks for a large lot. Do not invent locations. Numbers must be plain numbers.`;

const clean = (s, n) => String(s ?? "").replace(/[^\p{L}\p{N} .,'&/+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** Keeps only known filters with sane values. Never trust the model's output directly. */
export function sanitize(raw) {
  const patch = {};
  if (!raw || typeof raw !== "object") return { patch, unsupported: [], declined: false };
  for (const [k, [lo, hi]] of Object.entries(NUMS)) {
    const v = Number(raw[k]);
    if (raw[k] != null && raw[k] !== "" && Number.isFinite(v) && v >= lo && v <= hi) patch[k] = Math.round(v);
  }
  for (const k of BOOLS) if (raw[k] === true) patch[k] = true;
  if (Array.isArray(raw.types)) { const t = raw.types.filter((x) => HOME_TYPES.includes(x)); if (t.length) patch.types = [...new Set(t)]; }
  if (Array.isArray(raw.counties)) { const c = raw.counties.map((x) => clean(x, 30).replace(/ county$/i, "")).filter(Boolean).slice(0, 5); if (c.length) patch.counties = c; }
  if (raw.stories === "single" || raw.stories === "multi") patch.stories = raw.stories;
  if (SORTS.includes(raw.sort) && raw.sort !== "relevant") patch.sort = raw.sort;
  const q = clean(raw.q, 60); if (q) patch.q = q;
  const kw = clean(raw.keyword, 40).split(" ").slice(0, 2).join(" "); if (kw) patch.keyword = kw;
  if (patch.priceMin && patch.priceMax && patch.priceMin > patch.priceMax) [patch.priceMin, patch.priceMax] = [patch.priceMax, patch.priceMin];
  const unsupported = Array.isArray(raw.unsupported) ? raw.unsupported.map((x) => clean(x, 60)).filter(Boolean).slice(0, 5) : [];
  return { patch, unsupported, declined: raw.declined === true };
}

function parseJSON(text) {
  const s = String(text || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

async function callGemini(text) {
  const body = {
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: `Search request: ${text}` }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: "application/json" },
  };
  let lastErr = "no model";
  for (const model of MODELS()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 404 || res.status === 400) { lastErr = `${model}: ${res.status}`; continue; } // unknown model: try the next
    if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status });
    const data = await res.json();
    const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const parsed = parseJSON(out);
    if (!parsed) throw new Error("Gemini returned no JSON");
    return { parsed, model };
  }
  throw new Error(`No usable Gemini model (${lastErr})`);
}

/** Daily caps so the feature can't run up a bill: one total, one per visitor. */
async function underLimit(visitor) {
  const key = `ai-search/usage-${new Date().toISOString().slice(0, 10)}`;
  const u = (await getJSON(key).catch(() => null)) || { total: 0, by: {} };
  const id = createHash("sha256").update(String(visitor || "unknown")).digest("hex").slice(0, 12);
  if (u.total >= DAILY_LIMIT() || (u.by[id] || 0) >= PER_VISITOR()) return false;
  u.total += 1; u.by[id] = (u.by[id] || 0) + 1;
  await setJSON(key, u).catch(() => {});
  return true;
}

/** @returns {{ok:true, patch, unsupported, declined} | {ok:false, reason, status}} */
export async function aiSearch(text, visitor) {
  if (!aiSearchEnabled()) return { ok: false, reason: "off", status: 503 };
  const t = clean(text, 300);
  if (t.length < 3) return { ok: false, reason: "empty", status: 400 };
  if (!(await underLimit(visitor))) return { ok: false, reason: "limit", status: 429 };
  try {
    const { parsed } = await callGemini(t);
    return { ok: true, ...sanitize(parsed) };
  } catch (e) {
    console.error("ai-search:", e.message);
    return { ok: false, reason: "error", status: 502 };
  }
}
