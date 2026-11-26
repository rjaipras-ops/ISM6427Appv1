// This week's average 30-year fixed mortgage rate: Freddie Mac's Primary Mortgage Market Survey,
// published weekly (Thursdays) and served by the St. Louis Fed (FRED series MORTGAGE30US).
// Read from FRED's public CSV (no key). The last good value is kept, so a FRED outage never
// leaves the site without a rate.

import { getJSON, setJSON } from "./store.mjs";

const SERIES = "MORTGAGE30US";
const KEY = "rates/mortgage30";
const MAX_AGE_MS = 6 * 3600e3;

/** Latest { date, value } from FRED's CSV text ("observation_date,MORTGAGE30US\n2026-11-25,7.21"). */
export function latestFromCsv(csv) {
  const rows = String(csv).trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  for (let i = rows.length - 1; i >= 0; i--) {
    const [date, v] = rows[i];
    const value = Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value > 0 && value < 25) return { date, value };
  }
  return null;
}

async function fromFred() {
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${SERIES}&cosd=${since}`, {
    headers: { "User-Agent": "iToured mortgage rate" }, signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`FRED ${res.status}`);
  const latest = latestFromCsv(await res.text());
  if (!latest) throw new Error("FRED: no value");
  return latest;
}

/** { rate30, asOf, source, url } or { rate30: null } if no rate has ever been fetched. */
export async function mortgageRate() {
  const saved = await getJSON(KEY).catch(() => null);
  if (saved && Date.now() - Date.parse(saved.fetchedAt) < MAX_AGE_MS) return saved.rate;
  try {
    const { date, value } = await fromFred();
    const rate = {
      rate30: value, asOf: date,
      source: "Freddie Mac Primary Mortgage Market Survey (30-year fixed average), via FRED",
      url: `https://fred.stlouisfed.org/series/${SERIES}`,
    };
    await setJSON(KEY, { fetchedAt: new Date().toISOString(), rate });
    return rate;
  } catch (e) {
    console.warn("[rates]", e.message);
    return saved?.rate || { rate30: null };
  }
}
