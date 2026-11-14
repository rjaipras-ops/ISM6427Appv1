// GET /api/idx/county-survey — TEMPORARY setup helper: active residential listing counts per
// Florida county (checks each county name's spelling variants), to plan statewide coverage.
// Only county names and counts are returned. Progress is saved; call until done. Remove after use.
import { idxConfig } from "../lib/config.mjs";
import { sparkGet, qs } from "../lib/spark.mjs";
import { getJSON, setJSON } from "../lib/store.mjs";

const FL = ["Alachua","Baker","Bay","Bradford","Brevard","Broward","Calhoun","Charlotte","Citrus","Clay","Collier","Columbia",
  "Miami-Dade","Miami Dade","Dade","DeSoto","De Soto","Dixie","Duval","Escambia","Flagler","Franklin","Gadsden","Gilchrist","Glades","Gulf",
  "Hamilton","Hardee","Hendry","Hernando","Highlands","Hillsborough","Holmes","Indian River","Jackson","Jefferson","Lafayette","Lake",
  "Lee","Leon","Levy","Liberty","Madison","Manatee","Marion","Martin","Monroe","Nassau","Okaloosa","Okeechobee","Orange","Osceola",
  "Palm Beach","Pasco","Pinellas","Polk","Putnam","St. Johns","St Johns","Saint Johns","St. Lucie","Santa Rosa","Sarasota","Seminole",
  "Sumter","Suwannee","Taylor","Union","Volusia","Wakulla","Walton","Washington","Other"];

export default async () => {
  const cfg = idxConfig();
  if (cfg.mock) return Response.json({ error: "Feed not configured" }, { status: 404 });
  const s = (await getJSON("county-survey2")) || { at: new Date().toISOString(), counts: {}, total: null, totalFL: null };
  const deadline = Date.now() + 8500;
  const count = async (filter) => {
    const j = await sparkGet(`${cfg.baseUrl}/Property?${qs({ $filter: filter, $top: "0", $count: "true" })}`, { deadline });
    return j["@odata.count"] ?? null;
  };
  const base = "StandardStatus eq 'Active' and PropertyType eq 'Residential'";
  try {
    if (s.total == null) s.total = await count(base);
    if (s.totalFL == null) s.totalFL = await count(`${base} and StateOrProvince eq 'FL'`);
    const todo = FL.filter((c) => !(c in s.counts));
    for (let i = 0; i < todo.length && Date.now() < deadline - 2500; i += 10) {
      const batch = todo.slice(i, i + 10);
      const res = await Promise.all(batch.map((c) => count(`${base} and CountyOrParish eq '${c.replace(/'/g, "''")}'`).catch(() => undefined)));
      batch.forEach((c, k) => { if (res[k] !== undefined) s.counts[c] = res[k]; });
    }
  } catch (e) { s.lastError = String(e.message).slice(0, 200); }
  await setJSON("county-survey2", s);
  const found = Object.entries(s.counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const sumFound = found.reduce((a, [, n]) => a + n, 0);
  return Response.json({ done: FL.every((c) => c in s.counts), total: s.total, totalFL: s.totalFL, sumFound, counties: Object.fromEntries(found), lastError: s.lastError || null });
};

export const config = { path: "/api/idx/county-survey" };
