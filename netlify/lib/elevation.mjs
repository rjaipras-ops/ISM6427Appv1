// Ground elevation at a point, in feet above sea level (NAVD88).
//  1. USGS Elevation Point Query Service: 3DEP data, 1-meter lidar across South Florida (official, free).
//  2. Fallback: Open Topo Data's public API (USGS NED 10 m), limited to about 1,000 lookups a day.
// Results are kept by rounded location (about 1 m), so each home is looked up once.

import { getJSON, setJSON } from "./store.mjs";

const M_TO_FT = 3.28084;
const round5 = (n) => Math.round(Number(n) * 1e5) / 1e5;
// Florida, generously: anything else is refused.
export const inFlorida = (lat, lng) => lat > 24.3 && lat < 31.1 && lng > -87.7 && lng < -79.8;

async function usgs(lat, lng) {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Feet&wkid=4326&includeDate=false`;
  const res = await fetch(url, { headers: { "User-Agent": "iToured elevation" }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const j = await res.json();
  const v = Number(j.value);
  // The service answers -1000000 where it has no data.
  if (!Number.isFinite(v) || v < -100 || v > 400) throw new Error("USGS: no data");
  return { feet: v, source: "USGS 3D Elevation Program", resolutionM: Number(j.resolution) || null };
}

async function openTopo(lat, lng) {
  const res = await fetch(`https://api.opentopodata.org/v1/ned10m?locations=${lat},${lng}`, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`Open Topo Data ${res.status}`);
  const m = Number((await res.json()).results?.[0]?.elevation);
  if (!Number.isFinite(m)) throw new Error("Open Topo Data: no data");
  return { feet: m * M_TO_FT, source: "USGS National Elevation Dataset (10 m), via Open Topo Data", resolutionM: 10 };
}

/** { feet, source, resolutionM, datum } or null. */
export async function elevationAt(lat, lng) {
  lat = round5(lat); lng = round5(lng);
  if (!inFlorida(lat, lng)) return null;
  const key = `elev/${lat},${lng}`;
  const cached = await getJSON(key).catch(() => null);
  if (cached) return cached;
  let r = null;
  for (const f of [usgs, openTopo]) {
    try { r = await f(lat, lng); break; } catch (e) { console.warn("[elevation]", e.message); }
  }
  if (!r) return null;
  const out = { feet: Math.round(r.feet * 10) / 10, source: r.source, resolutionM: r.resolutionM, datum: "NAVD88" };
  await setJSON(key, out).catch(() => {});
  return out;
}
