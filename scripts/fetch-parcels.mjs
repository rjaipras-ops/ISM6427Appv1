// Fetches public parcel records for every demo listing (data/listings.json) from
// the Florida Department of Revenue statewide parcel layer (no API key) and saves
// the best match per listing to data/parcels/parcels.json. build-listings.mjs
// merges them in. (Live MLS listings are looked up on demand by the IDX functions.)
//
// Usage: node scripts/fetch-parcels.mjs        (behind a proxy: NODE_USE_ENV_PROXY=1)
//
// The layer only indexes parcel ID / owner / county, so address searches time out;
// we look up parcels at each listing's coordinates and match by address + unit.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PARCEL_LAYER, parcelsAt, pickParcel } from "../netlify/lib/parcels.mjs";

const { listings } = JSON.parse(readFileSync(new URL("../data/listings.json", import.meta.url)));
const results = {};
const stats = {};
let done = 0;
const queue = [...listings];
async function worker() {
  for (let l; (l = queue.shift());) {
    let r;
    try {
      r = pickParcel(l, await parcelsAt(l.Longitude, l.Latitude));
      if (r.status === "no_match") r = pickParcel(l, await parcelsAt(l.Longitude, l.Latitude, { box: true }));
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
  url: PARCEL_LAYER, retrieved: new Date().toISOString().slice(0, 10), parcels: results,
}, null, 1));
console.log("\n", stats);
