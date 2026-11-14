// GET /api/idx/county-survey — TEMPORARY setup helper: how many active residential listings the
// feed has per Florida county (exact CountyOrParish spellings), to plan statewide coverage.
// Only county names and counts are returned. Cached 24h. Remove after use.
import { idxConfig } from "../lib/config.mjs";
import { sparkGet, qs } from "../lib/spark.mjs";
import { getJSON, setJSON } from "../lib/store.mjs";

export default async () => {
  const cfg = idxConfig();
  if (cfg.mock) return Response.json({ error: "Feed not configured" }, { status: 404 });
  const cached = await getJSON("county-survey");
  if (cached?.done && Date.now() - Date.parse(cached.at) < 864e5) return Response.json(cached);
  const out = cached && !cached.done ? cached : { at: new Date().toISOString(), counts: {}, statesSeen: {}, pagesRead: 0, next: null, done: false };
  const deadline = Date.now() + 8000;
  let url = out.next || `${cfg.baseUrl}/Property?${qs({ $filter: "StandardStatus eq 'Active' and PropertyType eq 'Residential'", $select: "CountyOrParish,StateOrProvince", $top: "1000" })}`;
  while (url && Date.now() < deadline - 2500) {
    const j = await sparkGet(url, { deadline });
    for (const r of j.value || []) {
      const st = r.StateOrProvince || "?";
      out.statesSeen[st] = (out.statesSeen[st] || 0) + 1;
      const k = `${st}|${r.CountyOrParish || "?"}`;
      out.counts[k] = (out.counts[k] || 0) + 1;
    }
    out.pagesRead++;
    url = j["@odata.nextLink"] || null;
  }
  out.next = url; out.done = !url;
  await setJSON("county-survey", out);
  const sorted = Object.entries(out.counts).sort((a, b) => b[1] - a[1]);
  return Response.json({ ...out, next: out.next ? "(more pages: call again)" : null, counts: Object.fromEntries(sorted) });
};

export const config = { path: "/api/idx/county-survey" };
