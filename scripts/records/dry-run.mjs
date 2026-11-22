// Dry run: checks a sample of current Palm Beach listings against the Florida DOR 2026 tax roll
// and prints the private report to this console. Writes nothing to the site or to storage.
//
//   npm run records:dry-run                    (12 listings)
//   npm run records:dry-run -- --count 20 --seed 7
//
// Needs network access to itoured.com (public listing endpoints) and floridarevenue.com.
// DOR files are cached in .records-cache/ (gitignored).

import { loadConfig } from "./config/index.mjs";
import { siteIndex, siteListing } from "./sources/listings.mjs";
import { ensureCountyCsv } from "./sources/dor.mjs";
import { checkCounty } from "./run.mjs";
import { formatReport } from "./report.mjs";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean).map((a) => a.trim().split(/\s+/)));
const COUNT = Number(args.count || 12);
const SEED = Number(args.seed || 20261122);
const COUNTY = "Palm Beach";
const YEAR = 2026;
const CACHE = new URL("../../.records-cache/dor/", import.meta.url).pathname;

// Small seeded shuffle so a dry run can be repeated on the same listings.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

async function sample() {
  const all = (await siteIndex()).filter((r) => r.County === COUNTY && !r.AddressHidden && r["demo.StandardStatus"] === "Active");
  // A mix like the county's inventory: houses, condos, townhouses and one lot.
  const plan = [["Single Family", 5], ["Condo", 4], ["Townhouse", 2], ["Land", 1]];
  const rand = rng(SEED), picked = [];
  for (const [type, n] of plan) {
    const pool = all.filter((r) => r.PropertyType === type);
    for (let i = 0; i < Math.round((n * COUNT) / 12) && pool.length; i++) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  const out = [];
  for (const r of picked.slice(0, COUNT)) {
    out.push(await siteListing(r.ListingId));
    await new Promise((res) => setTimeout(res, 300)); // gentle on the site
  }
  return out;
}

const config = loadConfig(YEAR);
const [listings, nalCsv, sdfCsv] = await Promise.all([
  sample(),
  ensureCountyCsv(COUNTY, "NAL", YEAR, CACHE),
  ensureCountyCsv(COUNTY, "SDF", YEAR, CACHE),
]);
const t0 = Date.now();
const res = await checkCounty(listings, {
  nalCsv, sdfCsv, config,
  source: { label: `Florida DOR ${YEAR} tax roll (NAL + SDF), ${COUNTY} County, ${nalCsv.split("/").slice(-2).join("/")}` },
});
console.log(formatReport(res, { title: `Public record check — DRY RUN, ${listings.length} ${COUNTY} listings` }));
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s to scan the county files)`);
