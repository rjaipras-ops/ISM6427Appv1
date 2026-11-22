// Minimal streaming CSV reader for the DOR tax roll files (RFC 4180 quoting, header row).
// No dependencies; reads line by line so a 350 MB county file never sits in memory.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Splits one CSV record into fields. Returns null if a quoted field continues on the next line. */
export function splitCsv(line) {
  const out = [];
  let i = 0, field = "", quoted = false;
  while (i < line.length) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ",") { out.push(field); field = ""; i++; continue; }
    field += c; i++;
  }
  if (quoted) return null;
  out.push(field);
  return out;
}

/**
 * Calls onRow(object) for every data row. `pick` limits the columns kept (saves memory);
 * `filter(get)` can reject a row cheaply before the object is built (get(name) reads one column).
 */
export async function eachRow(path, onRow, { pick = null, filter = null, encoding = "latin1" } = {}) {
  const rl = createInterface({ input: createReadStream(path, { encoding }), crlfDelay: Infinity });
  let header = null, col = null, pending = "", rows = 0;
  for await (const raw of rl) {
    const line = pending ? `${pending}\n${raw}` : raw;
    const f = splitCsv(line);
    if (!f) { pending = line; continue; }
    pending = "";
    if (!header) {
      header = f.map((h) => h.trim());
      col = Object.fromEntries(header.map((h, i) => [h, i]));
      continue;
    }
    if (filter && !filter((name) => f[col[name]])) continue;
    const names = pick || header;
    const o = {};
    for (const n of names) o[n] = f[col[n]] ?? "";
    rows++;
    onRow(o);
  }
  return { header, rows };
}
