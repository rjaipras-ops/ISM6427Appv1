// Rooftop solar potential for a listing, from Google's Solar API (buildingInsights:findClosest).
//
// Cost control (the API is billed per lookup beyond Google's free monthly allowance):
//  - only for houses (Single Family, Townhouse, Multi-Family), looked up by listing key, so nobody can
//    run up lookups for arbitrary places;
//  - each result is reused for 30 days (the longest Google's terms allow content to be cached);
//  - a monthly cap on calls to Google (SOLAR_MONTHLY_CAP, default 2,000).
// Needs GOOGLE_SOLAR_API_KEY (a Google Cloud key restricted to the Solar API). Without it the
// feature is off and listing pages don't show the section.

import { getJSON, setJSON, readIndex } from "./store.mjs";
import { INDEX_FIELDS, INDEX_FLAGS } from "./index-format.mjs";

const TTL_MS = 30 * 864e5;
const HOUSE_TYPES = new Set(["Single Family", "Townhouse", "Multi-Family"]);
const TYPICAL_KW = 7; // a common South Florida rooftop system size, for the yearly-energy line

const apiKey = () => (process.env.GOOGLE_SOLAR_API_KEY || "").trim();
const monthlyCap = () => Number(process.env.SOLAR_MONTHLY_CAP) || 2000;
export const solarEnabled = () => !!apiKey();

/** The figures shown on the listing page, from Google's buildingInsights response. */
export function summarize(b) {
  const sp = b?.solarPotential;
  if (!sp || !(sp.maxArrayPanelsCount > 0)) return null;
  const watts = Number(sp.panelCapacityWatts) || 400;
  const configs = (sp.solarPanelConfigs || []).filter((c) => c.panelsCount > 0 && c.yearlyEnergyDcKwh > 0);
  // The configuration closest to a typical system, limited to what fits on this roof.
  const target = Math.min(sp.maxArrayPanelsCount, Math.round((TYPICAL_KW * 1000) / watts));
  const typical = configs.reduce((best, c) => (!best || Math.abs(c.panelsCount - target) < Math.abs(best.panelsCount - target) ? c : best), null);
  const max = configs[configs.length - 1] || null;
  const d = b.imageryDate;
  return {
    sunHoursPerYear: Math.round(Number(sp.maxSunshineHoursPerYear) || 0) || null,
    maxPanels: sp.maxArrayPanelsCount,
    panelWatts: watts,
    roofAreaSqFt: sp.maxArrayAreaMeters2 ? Math.round(sp.maxArrayAreaMeters2 * 10.7639) : null,
    typical: typical ? { panels: typical.panelsCount, kw: Math.round((typical.panelsCount * watts) / 100) / 10, kwhPerYear: Math.round(typical.yearlyEnergyDcKwh) } : null,
    max: max ? { panels: max.panelsCount, kw: Math.round((max.panelsCount * watts) / 100) / 10, kwhPerYear: Math.round(max.yearlyEnergyDcKwh) } : null,
    imageryQuality: b.imageryQuality || null,
    imageryDate: d?.year ? `${d.year}-${String(d.month || 1).padStart(2, "0")}` : null,
  };
}

async function listingPoint(key) {
  const row = (await readIndex())[key];
  if (!row) return null;
  const o = Object.fromEntries(INDEX_FIELDS.map((f, i) => [f, row[i]]));
  const flags = Number(row[INDEX_FIELDS.length]) || 0;
  return { lat: Number(o.Latitude), lng: Number(o.Longitude), type: o.PropertyType, hidden: !!(flags & (1 << INDEX_FLAGS.indexOf("AddressHidden"))) };
}

/** { available: true, solar } | { available: false, reason } */
export async function solarForListing(key) {
  if (!solarEnabled()) return { available: false, reason: "off" };
  const p = await listingPoint(key);
  if (!p || !Number.isFinite(p.lat)) return { available: false, reason: "not found" };
  if (!HOUSE_TYPES.has(p.type) || p.hidden) return { available: false, reason: "not a house" };
  const cacheKey = `solar/${key}`;
  const cached = await getJSON(cacheKey).catch(() => null);
  if (cached && Date.now() - Date.parse(cached.at) < TTL_MS) return cached.solar ? { available: true, solar: cached.solar } : { available: false, reason: "no data" };

  const month = new Date().toISOString().slice(0, 7);
  const countKey = `solar-calls/${month}`;
  const used = Number(await getJSON(countKey).catch(() => 0)) || 0;
  if (used >= monthlyCap()) return { available: false, reason: "monthly cap" };
  await setJSON(countKey, used + 1);

  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${p.lat.toFixed(6)}&location.longitude=${p.lng.toFixed(6)}&requiredQuality=MEDIUM&key=${encodeURIComponent(apiKey())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  let solar = null;
  if (res.ok) solar = summarize(await res.json());
  else if (res.status !== 404) {
    // Never log the URL: it contains the key.
    console.warn("[solar] Google answered", res.status);
    return { available: false, reason: "error" };
  }
  await setJSON(cacheKey, { at: new Date().toISOString(), solar });
  return solar ? { available: true, solar } : { available: false, reason: "no data" };
}
