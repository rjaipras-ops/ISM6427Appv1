// Closed-sale statistics from the Florida DOR tax roll files, for the owner's weekly market report.
// Public records: counts and medians only, never parcels or addresses, so they may be published
// (with the source and date). Runs in the daily record check (GitHub Actions).
//
// Field meanings (DOR NAL/SDF Users Guide):
//   DOR_UC   use code: 001 single family, 004 condominium
//   QUAL_CD  sale qualification: 01-02 qualified arm's-length sales (see lib/record.mjs qualification())
//   VI_CD    V vacant / I improved at the time of sale
//   MULTI_PAR_SAL  set when the sale covered more than one parcel (its price isn't for this parcel alone)
//   PHY_CITY situs city

import { eachRow } from "./lib/csv.mjs";

export const GROUPS = { "001": "single-family", "004": "condo" };
const MIN_CITY_SALES = 10;

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const titleCase = (s) => String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).trim();

/** Is this SDF row a qualified, improved, single-parcel sale? */
export function usableSale(r) {
  const q = Number(r.QUAL_CD);
  return (q === 1 || q === 2) && String(r.VI_CD || "").trim().toUpperCase() === "I" && !String(r.MULTI_PAR_SAL || "").trim() && Number(r.SALE_PRC) > 0;
}

/**
 * Aggregates sales. `parcels`: Map PARCEL_ID -> { group, city }. `sales`: SDF rows.
 * Returns { window, months: [{ ym, group, count, median }], cities: { window, rows: [{ city, group, count, median }] } }.
 */
export function aggregate(parcels, sales, { cityMonths = 3 } = {}) {
  const byMonth = new Map();
  const yms = new Set();
  for (const r of sales) {
    if (!usableSale(r)) continue;
    const p = parcels.get(r.PARCEL_ID);
    if (!p) continue;
    const ym = `${r.SALE_YR}-${String(r.SALE_MO).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    yms.add(ym);
    const k = `${ym}|${p.group}`;
    if (!byMonth.has(k)) byMonth.set(k, { ym, group: p.group, prices: [], cities: new Map() });
    const b = byMonth.get(k);
    b.prices.push(Number(r.SALE_PRC));
    if (p.city) { if (!b.cities.has(p.city)) b.cities.set(p.city, []); b.cities.get(p.city).push(Number(r.SALE_PRC)); }
  }
  const sorted = [...yms].sort();
  // The newest month in the file is usually incomplete (sales are still being recorded): leave it out.
  const complete = sorted.slice(0, -1);
  const months = [...byMonth.values()].filter((b) => complete.includes(b.ym))
    .map((b) => ({ ym: b.ym, group: b.group, count: b.prices.length, median: median(b.prices) }))
    .sort((a, b) => a.ym.localeCompare(b.ym) || a.group.localeCompare(b.group));
  const recent = complete.slice(-cityMonths);
  const cityAgg = new Map();
  for (const b of byMonth.values()) {
    if (!recent.includes(b.ym)) continue;
    for (const [city, prices] of b.cities) {
      const k = `${city}|${b.group}`;
      if (!cityAgg.has(k)) cityAgg.set(k, { city, group: b.group, prices: [] });
      cityAgg.get(k).prices.push(...prices);
    }
  }
  const rows = [...cityAgg.values()].filter((c) => c.prices.length >= MIN_CITY_SALES)
    .map((c) => ({ city: c.city, group: c.group, count: c.prices.length, median: median(c.prices) }))
    .sort((a, b) => b.count - a.count).slice(0, 40);
  // True medians for the last `cityMonths` complete months and the same months a year earlier.
  const yearBefore = recent.map((ym) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`);
  const summary = Object.values(GROUPS).map((group) => {
    const pick = (list) => [...byMonth.values()].filter((b) => b.group === group && list.includes(b.ym)).flatMap((b) => b.prices);
    const now = pick(recent), before = pick(yearBefore);
    const priorComplete = yearBefore.every((ym) => byMonth.has(`${ym}|${group}`));
    return now.length ? { group, from: recent[0], to: recent.at(-1), count: now.length, median: median(now), priorMedian: priorComplete ? median(before) : null } : null;
  }).filter(Boolean);
  return {
    window: complete.length ? `${complete[0]} to ${complete.at(-1)}` : null,
    summary,
    months,
    cities: { window: recent.length ? `${recent[0]} to ${recent.at(-1)}` : null, rows },
  };
}

/** Reads the county's NAL (use code and city per parcel) and SDF (sales) files. */
export async function salesStats(nalCsv, sdfCsv) {
  const parcels = new Map();
  await eachRow(nalCsv, (r) => parcels.set(r.PARCEL_ID, { group: GROUPS[String(r.DOR_UC).trim().padStart(3, "0")], city: titleCase(r.PHY_CITY) }), {
    pick: ["PARCEL_ID", "DOR_UC", "PHY_CITY"],
    filter: (get) => !!GROUPS[String(get("DOR_UC") || "").trim().padStart(3, "0")],
  });
  const sales = [];
  await eachRow(sdfCsv, (r) => sales.push(r), { pick: ["PARCEL_ID", "SALE_YR", "SALE_MO", "SALE_PRC", "QUAL_CD", "VI_CD", "MULTI_PAR_SAL"], filter: (get) => parcels.has(get("PARCEL_ID")) });
  return aggregate(parcels, sales);
}
