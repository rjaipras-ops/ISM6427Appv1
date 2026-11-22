import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { splitCsv, eachRow } from "../lib/csv.mjs";

test("splitCsv: quotes, escaped quotes, empty fields", () => {
  assert.deepEqual(splitCsv('60,"00424708100083180",,"A ""B"", C",9'), ["60", "00424708100083180", "", 'A "B", C', "9"]);
  assert.equal(splitCsv('1,"open'), null);
});

test("eachRow: picks columns, filters early, joins quoted line breaks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "csv-"));
  const f = join(dir, "t.csv");
  writeFileSync(f, 'PARCEL_ID,PHY_ADDR1,JV\n"1","10 A ST",5\n"2","20 B\nST",6\n"3","30 C ST",7\n');
  const rows = [];
  const { rows: n } = await eachRow(f, (r) => rows.push(r), { pick: ["PARCEL_ID", "JV"], filter: (get) => get("PARCEL_ID") !== "3" });
  assert.equal(n, 2);
  assert.deepEqual(rows, [{ PARCEL_ID: "1", JV: "5" }, { PARCEL_ID: "2", JV: "6" }]);
});
