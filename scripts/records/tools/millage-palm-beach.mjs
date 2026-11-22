// Builds the Palm Beach part of config/millage-<year>.json from the county property appraiser's
// "Taxing Authority Code Description" PDF (pbcpao.gov/pdf/taxroll/Palm Beach County Tax Auth Code.pdf),
// converted to text with `pdftotext -layout`. Each row is one TAXAUTH code (the NAL TAX_AUTH_CD
// field): its component levies and a TOTAL. School levies come from the same office's
// "Final vs Proposed Millage Rates" PDF and are checked against every row.
//
//   node scripts/records/tools/millage-palm-beach.mjs <taxauth.txt> <final-vs-proposed.txt> > out.json

import { readFileSync } from "node:fs";

const [taxAuthTxt, ratesTxt] = process.argv.slice(2);
if (!taxAuthTxt || !ratesTxt) {
  console.error("usage: millage-palm-beach.mjs <taxauth.txt> <final-vs-proposed.txt>");
  process.exit(1);
}

// School levies, e.g. "SC01  SC11 School Board - State  3.0390  3.0390  0.0000".
const school = {};
for (const line of readFileSync(ratesTxt, "utf8").split("\n")) {
  const m = line.match(/School Board - (State|Local)\s+([\d.]+)\s+([\d.]+)/);
  if (m) school[m[1]] = Number(m[3]); // second figure is the final rate
}
if (!(school.State > 0 && school.Local > 0)) throw new Error("School levies not found in the final-vs-proposed text");
const schoolTotal = Math.round((school.State + school.Local) * 1e4) / 1e4;

const codes = {};
let rows = 0;
for (const line of readFileSync(taxAuthTxt, "utf8").split("\n")) {
  const m = line.match(/^(\d{5})\s+(\d+)\s+([A-Z][A-Z .'&-]+?)\s{2,}(.*)$/);
  if (!m) continue;
  const nums = m[4].trim().split(/\s+/).map(Number);
  if (nums.some(Number.isNaN) || !nums.length) throw new Error(`Unreadable row: ${line}`);
  // Every row must carry both school levies; otherwise the column layout is not what we expect.
  if (!nums.includes(school.State) || !nums.includes(school.Local)) throw new Error(`School levies missing in row ${m[1]}`);
  const total = nums[nums.length - 1];
  const sum = Math.round(nums.slice(0, -1).reduce((a, b) => a + b, 0) * 1e4) / 1e4;
  // The component columns are printed rounded (Boca Beach & Park 1.0331 shows as "1.03"), so a
  // small gap is expected; TOTAL is the figure used. A larger gap means a column was misread.
  const gap = Math.abs(sum - total);
  if (gap > 0.005) throw new Error(`Row ${m[1]}: components add to ${sum}, TOTAL says ${total}`);
  if (gap > 0.0005) console.error(`note: row ${m[1]} components add to ${sum}; using TOTAL ${total} (display rounding)`);
  codes[m[1]] = { name: m[3].trim(), total, school: schoolTotal, nonSchool: Math.round((total - schoolTotal) * 1e4) / 1e4 };
  rows++;
}
if (rows < 50) throw new Error(`Only ${rows} TAXAUTH rows parsed`);
process.stdout.write(JSON.stringify({ schoolLevies: { state: school.State, local: school.Local, total: schoolTotal }, byTaxAuthCode: codes }, null, 2) + "\n");
