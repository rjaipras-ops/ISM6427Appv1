// Fetches the boundary polygon of each matched parcel (from
// data/parcels/parcels.json) from the Florida DOR statewide parcel layer and
// saves them, simplified, to data/parcels/shapes.json:
//   { "<ListingId>": [[[lng, lat], ...], ...rings] }
// The app draws these outlines over satellite imagery. Also saves each parcel's
// county account number (ALT_KEY) to data/parcels/altkeys.json, which St. Lucie's
// property-appraiser record-card links use.
//
// Usage: node scripts/fetch-parcel-shapes.mjs   (run after fetch-parcels.mjs)
// (Behind a proxy, run with NODE_USE_ENV_PROXY=1.)
import { readFileSync, writeFileSync } from "node:fs";

const LAYER =
  "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
const { parcels } = JSON.parse(readFileSync(new URL("../data/parcels/parcels.json", import.meta.url)));

// Parcel IDs repeat across counties, so look up by county + parcel ID.
const wanted = Object.entries(parcels)
  .filter(([, p]) => p.PARCEL_ID)
  .map(([listingId, p]) => ({ listingId, id: p.PARCEL_ID.trim(), co: p.CO_NO }));

async function post(params) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(LAYER, { method: "POST", body: new URLSearchParams(params), headers: { "User-Agent": "Toured listing enrichment" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

const round = (n) => Math.round(n * 1e6) / 1e6;
const shapes = {};
const altKeys = {};
const BATCH = 25;
for (let i = 0; i < wanted.length; i += BATCH) {
  const batch = wanted.slice(i, i + BATCH);
  const where = batch.map((w) => `(CO_NO=${w.co} AND PARCEL_ID='${w.id.replace(/'/g, "''")}')`).join(" OR ");
  const j = await post({
    where, outFields: "PARCEL_ID,CO_NO,ALT_KEY", returnGeometry: "true", outSR: "4326",
    geometryPrecision: "6", maxAllowableOffset: "0.000004", f: "json",
  });
  const byKey = new Map(j.features.map((f) => [`${f.attributes.CO_NO}|${f.attributes.PARCEL_ID.trim()}`, f]));
  for (const w of batch) {
    const f = byKey.get(`${w.co}|${w.id}`);
    const g = f?.geometry;
    const alt = String(f?.attributes?.ALT_KEY || "").trim();
    if (alt) altKeys[w.listingId] = alt;
    if (g?.rings?.length) shapes[w.listingId] = g.rings.map((ring) => ring.map(([x, y]) => [round(x), round(y)]));
  }
  process.stdout.write(`\r${Math.min(i + BATCH, wanted.length)}/${wanted.length}`);
}
writeFileSync(new URL("../data/parcels/shapes.json", import.meta.url), JSON.stringify(shapes));
writeFileSync(new URL("../data/parcels/altkeys.json", import.meta.url), JSON.stringify(altKeys));
console.log(`\nSaved outlines for ${Object.keys(shapes).length}/${wanted.length} parcels`);
