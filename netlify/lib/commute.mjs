// Commute-time search: the area reachable from a place within N minutes (driving, cycling or walking),
// from OpenRouteService (openrouteservice.org, free plan: about 500 travel-time areas and 1,000
// address lookups a day). Needs ORS_API_KEY. Results are kept for 30 days per request, and a daily
// cap keeps the site under the free plan.
//
// Travel times are typical times without live traffic.

import { createHash } from "node:crypto";
import { getJSON, setJSON } from "./store.mjs";

const ORS = "https://api.openrouteservice.org";
const PROFILES = { drive: "driving-car", bike: "cycling-regular", walk: "foot-walking" };
export const MINUTES = [10, 15, 20, 30, 45, 60];
const TTL_MS = 30 * 864e5;
const DAILY_CAP = () => Number(process.env.COMMUTE_DAILY_CAP) || 400;
// South Florida and the Treasure Coast, generously.
const BOX = { minLat: 24.3, maxLat: 28.2, minLng: -82.9, maxLng: -79.8 };

const apiKey = () => (process.env.ORS_API_KEY || "").trim();
export const commuteEnabled = () => !!apiKey();

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** Outer rings ([[lng, lat], ...]) from an isochrone GeoJSON FeatureCollection. */
export function ringsFromIsochrone(geo) {
  const g = geo?.features?.[0]?.geometry;
  if (!g) return null;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const rings = polys.map((p) => (p[0] || []).map(([x, y]) => [round5(x), round5(y)])).filter((r) => r.length >= 4);
  return rings.length ? rings : null;
}

async function ors(path, opts = {}) {
  const res = await fetch(`${ORS}${path}`, {
    ...opts,
    headers: { Authorization: apiKey(), Accept: "application/json, application/geo+json", "Content-Type": "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}`);
  return res.json();
}

async function geocode(q) {
  const p = new URLSearchParams({
    text: q, size: "1", "boundary.country": "US",
    "boundary.rect.min_lat": BOX.minLat, "boundary.rect.max_lat": BOX.maxLat, "boundary.rect.min_lon": BOX.minLng, "boundary.rect.max_lon": BOX.maxLng,
    "focus.point.lat": "26.2", "focus.point.lon": "-80.2",
  });
  const j = await ors(`/geocode/search?${p}`, { method: "GET" });
  const f = j.features?.[0];
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lat: round5(lat), lng: round5(lng), label: f.properties?.label || q };
}

/** { place: { label, lat, lng }, minutes, mode, rings } | { error } */
export async function commuteArea(q, minutes, mode) {
  if (!commuteEnabled()) return { error: "off" };
  q = String(q || "").trim().replace(/\s+/g, " ").slice(0, 120);
  minutes = Number(minutes);
  if (q.length < 3) return { error: "Type an address or place." };
  if (!MINUTES.includes(minutes)) return { error: "Pick a travel time." };
  if (!PROFILES[mode]) return { error: "Pick drive, bike or walk." };

  const id = createHash("sha256").update(`${q.toLowerCase()}|${minutes}|${mode}`).digest("hex").slice(0, 24);
  const cached = await getJSON(`commute/${id}`).catch(() => null);
  if (cached && Date.now() - Date.parse(cached.at) < TTL_MS) return cached.result;

  const day = new Date().toISOString().slice(0, 10);
  const used = Number(await getJSON(`commute-calls/${day}`).catch(() => 0)) || 0;
  if (used >= DAILY_CAP()) return { error: "Commute search is busy today. Please try again tomorrow." };
  await setJSON(`commute-calls/${day}`, used + 2); // an address lookup and a travel-time area

  const place = await geocode(q);
  if (!place) return { error: `Couldn't find "${q}" in South Florida. Try a full address or a well-known place.` };
  const geo = await ors(`/v2/isochrones/${PROFILES[mode]}`, {
    method: "POST",
    body: JSON.stringify({ locations: [[place.lng, place.lat]], range: [minutes * 60], range_type: "time", smoothing: 5 }),
  });
  const rings = ringsFromIsochrone(geo);
  if (!rings) return { error: "Couldn't work out a travel-time area for that place." };
  const result = { place, minutes, mode, rings };
  await setJSON(`commute/${id}`, { at: new Date().toISOString(), result });
  return result;
}
