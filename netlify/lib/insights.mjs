// Search insights: anonymous daily totals of what visitors search for, the filters they use and
// the homes they open, for the site owner's admin page. Nothing here identifies a person: no
// account, IP address or cookie is stored, typed text containing contact details is dropped,
// and each day is one small summary document (insights/YYYY-MM-DD).
// Counts are approximate: two visitors saving at the same instant can overwrite one tick.

import { getJSON, setJSON } from "./store.mjs";

const KEEP_DAYS = 120;
const MAX_KEYS = 300; // per table per day
const BOOLS = ["pool", "waterfront", "view", "fireplace", "centralAir", "basement", "gated", "solar", "ev", "impactWindows",
  "boatDock", "oceanAccess", "golf", "noFloodZone", "cbs", "str", "newConstruction", "priceReduced", "openHouse",
  "foreclosure", "virtualTour", "hideSenior", "reviewedOnly", "belowArea", "motivated", "hideOverpriced"];
const TYPES = ["Single Family", "Condo", "Townhouse", "Multi-Family", "Mobile/Manufactured", "Land"];
const PRICE_BUCKETS = [[300e3, "Under $300K"], [500e3, "$300K–$500K"], [750e3, "$500K–$750K"], [1e6, "$750K–$1M"], [2e6, "$1M–$2M"], [Infinity, "$2M+"]];
// Automated visitors (search engines, link previews, scripts) aren't counted.
const AUTOMATED = /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|scrap/i;

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const looksPersonal = (s) => /[\w.+-]+@[\w-]+\.\w|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{3}-\d{2}-\d{4}\b/.test(s);
const bump = (table, key, n = 1) => {
  if (!key) return;
  if (!(key in table) && Object.keys(table).length >= MAX_KEYS) return;
  table[key] = (table[key] || 0) + n;
};
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const TABLES = ["typed", "places", "counties", "prices", "payments", "beds", "baths", "types", "features", "keywords", "listings", "viewCities"];
const empty = () => ({ searches: 0, typedCount: 0, views: 0, ...Object.fromEntries(TABLES.map((t) => [t, {}])) });

function bucket(v) { for (const [hi, label] of PRICE_BUCKETS) if (v <= hi) return label; return null; }

/** Records one event. `ev` comes from the browser, so every field is checked here. */
export async function record(ev, { userAgent = "" } = {}) {
  if (!ev || typeof ev !== "object" || AUTOMATED.test(userAgent)) return false;
  const key = `insights/${day()}`;
  const d = { ...empty(), ...((await getJSON(key)) || {}) };
  if (ev.kind === "search") {
    const f = ev.f && typeof ev.f === "object" ? ev.f : {};
    d.searches++;
    const text = clip(ev.text, 120).toLowerCase();
    if (text && !looksPersonal(text)) { d.typedCount++; bump(d.typed, text); }
    bump(d.places, clip(f.q, 60).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
    if (Array.isArray(f.counties)) for (const c of f.counties.slice(0, 5)) bump(d.counties, clip(c, 30));
    const max = Number(f.priceMax), min = Number(f.priceMin);
    if (max > 0) bump(d.prices, bucket(max)); else if (min > 0) bump(d.prices, `${bucket(min)} and up`);
    if (Number(f.payMax) > 0) bump(d.payments, `Up to $${(Math.round(Number(f.payMax) / 500) * 500).toLocaleString("en-US")}/mo`);
    if (Number(f.bedsMin) > 0) bump(d.beds, `${Math.min(6, Math.round(f.bedsMin))}+ beds`);
    if (Number(f.bathsMin) > 0) bump(d.baths, `${Math.min(5, Math.round(f.bathsMin))}+ baths`);
    if (Array.isArray(f.types)) for (const t of f.types) if (TYPES.includes(t)) bump(d.types, t);
    for (const b of BOOLS) if (f[b] === true) bump(d.features, b);
    if (f.hoaMax === 0) bump(d.features, "noHoa");
    const kw = clip(f.keyword, 40).toLowerCase();
    if (kw && !looksPersonal(kw)) bump(d.keywords, kw);
  } else if (ev.kind === "view") {
    d.views++;
    const id = clip(ev.listingId, 60);
    if (/^[\w-]+$/.test(id)) bump(d.listings, id);
    bump(d.viewCities, clip(ev.city, 40));
  } else return false;
  await setJSON(key, d);
  return true;
}

/** Totals for the last `days` days (for the admin page). */
export async function summary(days = 30) {
  days = Math.max(1, Math.min(KEEP_DAYS, Number(days) || 30));
  const out = { ...empty(), days, byDay: [] };
  const docs = await Promise.all(Array.from({ length: days }, (_, i) => {
    const d = day(new Date(Date.now() - i * 864e5));
    return getJSON(`insights/${d}`).then((x) => [d, x]).catch(() => [d, null]);
  }));
  for (const [d, x] of docs) {
    out.byDay.push({ day: d, searches: x?.searches || 0, views: x?.views || 0 });
    if (!x) continue;
    for (const k of ["searches", "typedCount", "views"]) out[k] += x[k] || 0;
    for (const t of TABLES) for (const [k, v] of Object.entries(x[t] || {})) out[t][k] = (out[t][k] || 0) + v;
  }
  for (const t of TABLES) out[t] = Object.entries(out[t]).sort((a, b) => b[1] - a[1]).slice(0, t === "listings" ? 20 : 25);
  out.byDay.reverse();
  return out;
}
