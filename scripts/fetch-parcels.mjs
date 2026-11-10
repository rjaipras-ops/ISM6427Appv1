// Fetches public parcel records for every listing from the Florida Department of
// Revenue statewide parcel layer (no API key) and saves the best match per
// listing to data/parcels/parcels.json. build-listings.mjs merges them in.
//
// Usage: node scripts/fetch-parcels.mjs
// (Behind a proxy, run with NODE_USE_ENV_PROXY=1.)
//
// Matching: the layer only indexes parcel id / owner / county, so address
// searches time out. Instead we look up parcels at each listing's coordinates
// (spatial index, fast), widening to a ~25 m box if the point misses, and pick the one
// whose address matches (house number + street, and unit number for condos).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const LAYER =
  "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
// Owner mailing address fields are deliberately not requested.
const FIELDS = [
  "PARCEL_ID", "CO_NO", "ASMNT_YR", "DOR_UC", "JV", "AV_SD", "AV_NSD", "TV_SD", "TV_NSD", "JV_HMSTD",
  "LND_VAL", "LND_SQFOOT", "ACT_YR_BLT", "EFF_YR_BLT", "TOT_LVG_AR", "NO_RES_UNT",
  "SALE_PRC1", "SALE_YR1", "SALE_MO1", "QUAL_CD1", "SALE_PRC2", "SALE_YR2", "SALE_MO2", "QUAL_CD2",
  "OWN_NAME", "PHY_ADDR1", "PHY_CITY", "PHY_ZIPCD",
];

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);
const SUFFIX = new Set(["ST", "STREET", "AVE", "AVENUE", "AV", "RD", "ROAD", "DR", "DRIVE", "LN", "LANE", "CT", "COURT",
  "CIR", "CIRCLE", "BLVD", "BOULEVARD", "TER", "TERRACE", "TERR", "PL", "PLACE", "WAY", "PKWY", "PARKWAY", "TRL", "TRAIL",
  "HWY", "HIGHWAY", "PT", "POINT", "LOOP", "RUN", "PATH", "ROW", "MNR", "MANOR", "TRCE", "TRACE", "CV", "COVE", "SQ"]);

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const ordinal = (w) => w.replace(/^(\d+)(ST|ND|RD|TH)$/, "$1");

export function addressKey(l) {
  const street = norm(l.StreetAddress.replace(/\s(#\s?\w[\w-]*|Unit \w+|Apt \w+|Lot \w+)$/i, ""));
  const words = street.split(" ");
  const num = /^\d+$/.test(words[0]) ? words.shift() : "";
  const core = words.map(ordinal).filter((w) => !DIRS.has(w) && !SUFFIX.has(w));
  const kw = core.sort((a, b) => b.length - a.length)[0] || "";
  const unitRaw = (l.UnitNumber || (l.StreetAddress.match(/\s(?:#|Unit |Apt |Lot )\s?([\w-]+)$/i) || [])[1] || "");
  const unit = norm(unitRaw).replace(/\s/g, "");
  return { num, kw, unit };
}

async function atPoint(l, distance = 0) {
  const body = new URLSearchParams({
    // Point lookup, or (fallback) a box ~25 m around the point. Distance
    // buffers aren't supported by this layer's coordinate system.
    ...(distance
      ? { geometry: [l.Longitude - 0.00025, l.Latitude - 0.00025, l.Longitude + 0.00025, l.Latitude + 0.00025].join(","), geometryType: "esriGeometryEnvelope" }
      : { geometry: `${l.Longitude},${l.Latitude}`, geometryType: "esriGeometryPoint" }),
    inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: FIELDS.join(","), returnGeometry: "false", resultRecordCount: "2000", f: "json",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(LAYER, { method: "POST", body, headers: { "User-Agent": "Toured listing enrichment" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.features.map((f) => f.attributes);
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

export function pickParcel(l, rows) {
  const { num, kw, unit } = addressKey(l);
  const cands = rows.filter((r) => {
    const a = norm(r.PHY_ADDR1);
    return a.startsWith(num + " ") && (!kw || a.split(" ").map(ordinal).includes(kw)) && Number(r.PHY_ZIPCD) === Number(l.PostalCode);
  });
  if (!cands.length) return { status: "no_match" };
  if (unit) {
    const u = unit.replace(/^0+/, "");
    const hit = cands.filter((r) => {
      const toks = norm(r.PHY_ADDR1).split(" ");
      const last = toks[toks.length - 1].replace(/^0+/, "");
      return last === u || toks.slice(-2).join("").replace(/^0+/, "") === u;
    });
    if (hit.length === 1) return { status: "matched", parcel: hit[0] };
    return { status: hit.length ? "ambiguous" : "unit_not_found", candidates: cands.length };
  }
  // No unit: prefer a parcel whose address has no trailing unit token.
  const plain = cands.filter((r) => norm(r.PHY_ADDR1).split(" ").map(ordinal).at(-1) !== undefined);
  const uniq = new Map(plain.map((r) => [r.PARCEL_ID, r]));
  if (uniq.size === 1) return { status: "matched", parcel: [...uniq.values()][0] };
  // Several parcels: keep the one with the shortest address (no unit suffix).
  const sorted = [...uniq.values()].sort((a, b) => norm(a.PHY_ADDR1).length - norm(b.PHY_ADDR1).length);
  if (norm(sorted[0].PHY_ADDR1).length < norm(sorted[1].PHY_ADDR1).length) return { status: "matched", parcel: sorted[0] };
  return { status: "ambiguous", candidates: uniq.size };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { listings } = JSON.parse(readFileSync(new URL("../data/listings.json", import.meta.url)));
  const results = {};
  const stats = {};
  let done = 0;
  const queue = [...listings];
  async function worker() {
    for (let l; (l = queue.shift());) {
      let r;
      try {
        r = pickParcel(l, await atPoint(l));
        if (r.status === "no_match") r = pickParcel(l, await atPoint(l, 25));
      } catch (e) {
        r = { status: "error" };
        console.error(`\n${l.ListingId}: ${e.message}`);
      }
      stats[r.status] = (stats[r.status] || 0) + 1;
      results[l.ListingId] = r.parcel ? r.parcel : { _status: r.status };
      process.stdout.write(`\r${++done}/${listings.length}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  mkdirSync(new URL("../data/parcels/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../data/parcels/parcels.json", import.meta.url), JSON.stringify({
    source: "Florida Department of Revenue statewide parcel layer (Florida_Statewide_Cadastral, FeatureServer/0)",
    url: LAYER, retrieved: new Date().toISOString().slice(0, 10), parcels: results,
  }, null, 1));
  console.log("\n", stats);
}
