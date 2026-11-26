// Daily public record check (GitHub Actions: .github/workflows/record-check.yml).
//
//   1. Active Miami-Dade, Broward and Palm Beach listings from the MLS feed.
//   2. The current Florida DOR tax roll files (downloaded only when DOR posts newer ones).
//   3. Match, check, private signals, tax estimate.
//   4. Send the private report to the site (POST /api/records/upload, gzip), where it is kept in
//      Netlify Blobs for the admin page's "Record checks" tab.
//
// The repository and its Action logs are PUBLIC: this script prints counts only. Never add a
// console line with an address, listing ID, parcel number, owner or signal.
//
// Environment: SPARK_API_BEARER_TOKEN, RECORDS_UPLOAD_SECRET (both GitHub Actions secrets),
// optional RECORDS_UPLOAD_URL. With --no-upload the report is written to .records-cache/ instead.

import { salesStats } from "./market.mjs";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "./config/index.mjs";
import { sparkListings } from "./sources/spark.mjs";
import { ensureCountyCsv } from "./sources/dor.mjs";
import { checkCounty } from "./run.mjs";
import { toItem, countySummary } from "./stored.mjs";

const COUNTIES = ["Palm Beach", "Broward", "Miami-Dade"];
const YEAR = Number(process.env.RECORDS_TAX_YEAR || 2026);
const CACHE = new URL("../../.records-cache/dor/", import.meta.url).pathname;
const UPLOAD_URL = process.env.RECORDS_UPLOAD_URL || "https://itoured.com/api/records/upload";
const noUpload = process.argv.includes("--no-upload");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

async function main() {
  const config = loadConfig(YEAR);
  const started = Date.now();
  const { listings, parcelNumbers } = await sparkListings(COUNTIES);
  console.log(`MLS: ${listings.length} active listings in ${COUNTIES.join(", ")}; parcel numbers in feed: ${parcelNumbers ? "yes" : "no"}`);

  const report = { date: today(), runAt: new Date().toISOString(), taxYear: YEAR, counties: {}, items: [] };
  for (const county of COUNTIES) {
    const ls = listings.filter((l) => l.county === county);
    if (!ls.length) throw new Error(`No ${county} listings from the MLS feed; stopping so a partial report doesn't replace a full one`);
    const nalCsv = await ensureCountyCsv(county, "NAL", YEAR, CACHE);
    const sdfCsv = await ensureCountyCsv(county, "SDF", YEAR, CACHE);
    const label = `Florida DOR ${YEAR} tax roll, ${county} (${nalCsv.split("/").slice(-2)[0]})`;
    const res = await checkCounty(ls, { nalCsv, sdfCsv, config, source: { label } });
    const s = countySummary(res.results);
    report.counties[county] = { ...s, source: res.source };
    for (const r of res.results) { const it = toItem(r); if (it) report.items.push(it); }
    // Closed-sale statistics (public records, counts and medians only) for the weekly market report.
    try { (report.market ||= {})[county] = { source: label, ...(await salesStats(nalCsv, sdfCsv)) }; }
    catch (e) { console.log(`${county}: market statistics skipped (${e.message})`); }
    console.log(`${county}: ${s.listings} listings, ${s.checked} checked, ${s.unmatched + s.lowConfidence} not matched, ${s.withFlags} with differences, ${s.closerLook} for a closer look`);
    const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`  matched by: ${list(s.byMethod)}`);
    console.log(`  flags by check: ${list(s.flagsByCheck) || "none"}`);
  }

  const body = gzipSync(JSON.stringify(report));
  if (noUpload) {
    await mkdir(CACHE, { recursive: true });
    const f = new URL(`../../.records-cache/report-${report.date}.json`, import.meta.url).pathname;
    await writeFile(f, JSON.stringify(report, null, 1));
    console.log(`Report written locally (${report.items.length} items).`);
  } else {
    const secret = (process.env.RECORDS_UPLOAD_SECRET || "").trim();
    if (!secret) throw new Error("RECORDS_UPLOAD_SECRET is not set");
    const res = await fetch(UPLOAD_URL, {
      // Base64 text, not raw gzip: Netlify hands text bodies to functions as strings.
      method: "POST", body: body.toString("base64"),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "text/plain", "X-Body-Encoding": "gzip-base64", "User-Agent": "iToured record check" },
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status} ${text.slice(0, 120)}`);
    console.log(`Uploaded ${report.items.length} items (${Math.round(body.length / 1024)} KB).`);
  }
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s.`);
}

main().catch((e) => {
  // Message only: a stack trace or error object could carry data from a listing.
  console.error(`Record check failed: ${String(e?.message || e).slice(0, 300)}`);
  process.exit(1);
});
