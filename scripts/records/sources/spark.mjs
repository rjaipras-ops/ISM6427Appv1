// Active listings in the checked counties, straight from the MLS feed (RESO Web API), using the
// site's own client and normalizer so a listing looks exactly as it does on itoured.com.
// Needs SPARK_API_BEARER_TOKEN in the environment (a GitHub Actions secret for the daily job).
// Nothing here prints listing data.

import { sparkGet, qs } from "../../../netlify/lib/spark.mjs";
import { RESO_SELECT } from "../../../netlify/lib/spark.mjs";
import { idxConfig, ACTIVE } from "../../../netlify/lib/config.mjs";
import { normalizeListing } from "../../../netlify/lib/normalize.mjs";
import { normalize } from "./listings.mjs";

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
// Fields the record check needs on top of what normalizeListing reads (probed: the feed may not have it).
const OPTIONAL = ["ParcelNumber"];

function firstUrl(cfg, counties, select) {
  // The MLS may spell the county with or without " County"; ask for both.
  const c = counties.flatMap((n) => [n, `${n} County`]).map((n) => `CountyOrParish eq ${q(n)}`).join(" or ");
  const t = cfg.propertyTypes.map((x) => `PropertyType eq ${q(x)}`).join(" or ");
  const filter = `StandardStatus eq ${q(ACTIVE)} and StateOrProvince eq ${q(cfg.state || "FL")} and (${c}) and (${t})`;
  return `${cfg.baseUrl}/Property?${qs({ $filter: filter, $select: select.join(","), $top: "1000" })}`;
}

/** Returns { listings (normalized, see sources/listings.mjs), parcelNumbers: boolean }. */
export async function sparkListings(counties) {
  const cfg = idxConfig();
  if (cfg.mock) throw new Error("SPARK_API_BEARER_TOKEN is not set");
  if (cfg.flavor !== "reso") throw new Error("The record check reads the RESO Web API endpoint");
  const deadline = () => Date.now() + 120000;
  let select = [...RESO_SELECT, ...OPTIONAL];
  let url = firstUrl(cfg, counties, select), first;
  try {
    first = await sparkGet(url, { deadline: deadline() });
  } catch (e) {
    if (!/\b400\b/.test(e.message)) throw e;
    select = RESO_SELECT; // the feed doesn't expose ParcelNumber: carry on without it
    url = firstUrl(cfg, counties, select);
    first = await sparkGet(url, { deadline: deadline() });
  }
  const recs = [];
  for (let page = first; ; ) {
    recs.push(...(page.value || []));
    const next = page["@odata.nextLink"];
    if (!next) break;
    page = await sparkGet(next, { deadline: deadline() });
  }
  const listings = [];
  for (const rec of recs) {
    const n = normalizeListing(rec);
    if (!n) continue;
    const l = normalize(n);
    l.parcelId = rec.ParcelNumber || null;
    listings.push(l);
  }
  return { listings, parcelNumbers: select.includes("ParcelNumber") };
}
