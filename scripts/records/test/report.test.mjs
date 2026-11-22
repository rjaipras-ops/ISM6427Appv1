import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReport } from "../report.mjs";
import { runChecks } from "../checks/index.mjs";
import { config, record, listing, PCN } from "./helpers.mjs";

test("report: flags and tax lines present, no owner names or mailing addresses", () => {
  const rec = record(PCN.resale);
  const l = listing({ address: "17296 W Sycamore Dr", zip: "33470", city: "Loxahatchee", listDate: "2026-01-10", remarks: "Owner occupied." });
  const text = formatReport({
    source: { label: "fixture", salesWindow: "2025-01 to 2026-09" },
    results: [
      { listing: l, status: "checked", match: { method: "exactAddressNoUnit", confidence: 0.8, parcelId: rec.parcelId, situs: rec.situs.street }, record: rec, ...runChecks(l, rec, config) },
      { listing: listing({ address: "1 Nowhere Rd", zip: "33470" }), status: "unmatched", match: { method: "none", confidence: 0, reason: "no parcel" } },
    ],
  });
  assert.match(text, /checked: 1 .* not checked \(match\): 1/);
  assert.match(text, /TAX \(ad valorem, 2026 rates, district 00196/);
  assert.match(text, /CLOSER LOOK/);
  for (const s of ["SAMPLE", "EXAMPLE", "999 "]) assert.ok(!text.includes(s), `report contains ${s}`);
});
