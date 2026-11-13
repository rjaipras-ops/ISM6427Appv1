// GET /api/idx/field-survey — TEMPORARY setup helper. Lists the feed's field names and their most
// common values across a sample of active listings, so feature filters (CBS, short-term rentals,
// impact windows, docks, …) can be mapped to BeachesMLS's exact fields. Never returns addresses,
// people, remarks, prices or IDs. Cached for 24 hours so it can't be used to hammer the MLS API.
import { idxConfig } from "../lib/config.mjs";
import { sparkGet, qs } from "../lib/spark.mjs";
import { getJSON, setJSON } from "../lib/store.mjs";

const DENY = /agent|office|member|remarks|name|phone|email|fax|address|street|unparsed|key$|key\b|id$|url|timestamp|date|latitude|longitude|price|directions|showing|owner|tenant|occupant|lockbox|commission|compensation|parcel|tax|legal|zip|postal|unit|instructions|contact|appointment|license|permission|photo|media|@odata/i;

export default async () => {
  const cfg = idxConfig();
  if (cfg.mock) return Response.json({ error: "Feed not configured" }, { status: 404 });
  const cached = await getJSON("field-survey");
  if (cached && Date.now() - Date.parse(cached.at) < 864e5) return Response.json(cached, { headers: { "Cache-Control": "no-store" } });

  const counties = cfg.counties.map((c) => `CountyOrParish eq '${c.replace(/'/g, "''")}'`).join(" or ");
  const url = `${cfg.baseUrl}/Property?${qs({ $filter: `StandardStatus eq 'Active' and PropertyType eq 'Residential' and (${counties})`, $top: "120", $orderby: "ModificationTimestamp desc" })}`;
  const json = await sparkGet(url, { deadline: Date.now() + 8500 });
  const rows = json.value || [];
  const fields = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (DENY.test(k) || v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      const vals = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s*,\s*/) : [v];
      const f = (fields[k] ||= { filled: 0, values: {} });
      f.filled++;
      for (const x of vals) {
        const s = String(x).slice(0, 60);
        if (typeof x === "number" && !/YN$/.test(k)) { f.values["(number)"] = (f.values["(number)"] || 0) + 1; continue; }
        f.values[s] = (f.values[s] || 0) + 1;
      }
    }
  }
  for (const f of Object.values(fields)) {
    f.values = Object.fromEntries(Object.entries(f.values).sort((a, b) => b[1] - a[1]).slice(0, 15));
  }
  const out = { at: new Date().toISOString(), sampled: rows.length, fields };
  await setJSON("field-survey", out);
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/idx/field-survey" };
