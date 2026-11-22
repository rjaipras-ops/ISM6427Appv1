// Florida Department of Revenue tax roll data files (NAL = name-address-legal, SDF = sales).
// Listed through the data portal's SharePoint REST API, downloaded only when DOR posts a newer
// file, unzipped with the system `unzip`, then streamed. Field meanings: DOR "2026 NAL, SDF and
// NAP Users Guide" (config/exemptions-2026.json has its URL).

import { mkdir, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { eachRow } from "../lib/csv.mjs";
import { COUNTY_NO, NAL_COLUMNS, SDF_COLUMNS } from "../lib/record.mjs";

const run = promisify(execFile);
const PORTAL = "https://floridarevenue.com/property/dataportal";
const FOLDER = "/property/dataportal/Documents/PTO Data Portal/Tax Roll Data Files";
const UA = { "User-Agent": "iToured public-record check (tax roll data files)", Accept: "application/json;odata=nometadata" };
const DOR_NAME = { "Miami-Dade": "Dade", Broward: "Broward", "Palm Beach": "Palm Beach" };

/** Files in one roll folder, e.g. kind "NAL", roll "2026F" (final) or "2026P" (preliminary). */
export async function listRollFiles(kind, roll) {
  const folder = `${FOLDER}/${kind}/${roll}`.replace(/'/g, "''");
  const url = encodeURI(`${PORTAL}/_api/web/GetFolderByServerRelativeUrl('${folder}')/Files`) + "?$select=Name,TimeLastModified,Length,ServerRelativeUrl";
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`DOR listing ${kind}/${roll}: HTTP ${res.status}`);
  return (await res.json()).value;
}

/** The newest roll for a county and kind: final for the year if posted, otherwise preliminary. */
export async function findCountyFile(county, kind, year) {
  const no = COUNTY_NO[county];
  for (const roll of [`${year}F`, `${year}P`]) {
    const files = await listRollFiles(kind, roll).catch(() => []);
    const f = files.find((x) => x.Name.startsWith(`${DOR_NAME[county]} ${no} `));
    if (f) return { ...f, roll };
  }
  return null;
}

/**
 * Makes sure the county's CSV is in `cacheDir`, downloading only if DOR's file is newer than the
 * cached copy. Returns the CSV path.
 */
export async function ensureCountyCsv(county, kind, year, cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  const metaPath = join(cacheDir, `${kind}-${COUNTY_NO[county]}-${year}.meta.json`);
  const meta = await readFile(metaPath, "utf8").then(JSON.parse).catch(() => null);
  const remote = await findCountyFile(county, kind, year);
  if (!remote) {
    if (meta?.csv) return meta.csv;
    throw new Error(`No ${kind} file for ${county} ${year} on the DOR portal`);
  }
  if (meta?.csv && meta.timeLastModified === remote.TimeLastModified && await stat(meta.csv).catch(() => null)) return meta.csv;
  const zip = join(cacheDir, `${kind}-${COUNTY_NO[county]}-${remote.roll}.zip`);
  const res = await fetch(`https://floridarevenue.com${encodeURI(remote.ServerRelativeUrl)}`, { headers: { "User-Agent": UA["User-Agent"] } });
  if (!res.ok) throw new Error(`DOR download ${remote.Name}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
  const outDir = join(cacheDir, `${kind}-${COUNTY_NO[county]}-${remote.roll}`);
  await mkdir(outDir, { recursive: true });
  await run("unzip", ["-o", "-q", zip, "-d", outDir]);
  const csvName = (await readdir(outDir)).find((n) => n.toLowerCase().endsWith(".csv"));
  if (!csvName) throw new Error(`No CSV inside ${remote.Name}`);
  const csv = join(outDir, csvName);
  await writeFile(metaPath, JSON.stringify({ name: remote.Name, roll: remote.roll, timeLastModified: remote.TimeLastModified, csv }, null, 2));
  return csv;
}

/** NAL rows (selected columns) for which keep(get) is true. */
export async function readNal(csvPath, keep) {
  const rows = [];
  await eachRow(csvPath, (r) => rows.push(r), { pick: NAL_COLUMNS, filter: keep });
  return rows;
}

/** SDF rows grouped by parcel ID, for the given parcel IDs only. Also returns the months covered. */
export async function readSdf(csvPath, parcelIds) {
  const want = new Set(parcelIds);
  const byParcel = new Map();
  let min = null, max = null;
  await eachRow(csvPath, (r) => {
    const ym = `${r.SALE_YR}-${String(r.SALE_MO).padStart(2, "0")}`;
    if (/^\d{4}-\d{2}$/.test(ym)) { if (!min || ym < min) min = ym; if (!max || ym > max) max = ym; }
    if (!want.has(r.PARCEL_ID)) return;
    if (!byParcel.has(r.PARCEL_ID)) byParcel.set(r.PARCEL_ID, []);
    byParcel.get(r.PARCEL_ID).push(r);
  }, { pick: SDF_COLUMNS });
  return { byParcel, window: min && max ? `${min} to ${max}` : null };
}
