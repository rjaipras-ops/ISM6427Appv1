import { test } from "node:test";
import assert from "node:assert/strict";
import { livingArea } from "../checks/living-area.mjs";
import { yearBuilt } from "../checks/year-built.mjs";
import { lotSize } from "../checks/lot-size.mjs";
import { useCode } from "../checks/use-code.mjs";
import { lastSale } from "../checks/last-sale.mjs";
import { homesteadValue } from "../checks/homestead-value.mjs";
import { notChecked } from "../checks/not-checked.mjs";
import { fraudSignals } from "../checks/fraud.mjs";
import { runChecks } from "../checks/index.mjs";
import { rules, config, record, listing, PCN } from "./helpers.mjs";

const house = record(PCN.house);   // effective area 5,163; lot 8,135; built 2023
const condo = record(PCN.condo);   // unit area 835; built 1980
const resale = record(PCN.resale); // sales Jul 2025 $335,000 and Mar 2026 $480,000

test("living area: houses flag only when the listing exceeds effective area by >10%", () => {
  assert.equal(livingArea(listing({ livingArea: 4300 }), house, rules).status, "ok", "heated area below effective area is normal");
  assert.equal(livingArea(listing({ livingArea: 5600 }), house, rules).status, "ok", "+8%");
  assert.equal(livingArea(listing({ livingArea: 5800 }), house, rules).status, "flag", "+12%");
  assert.equal(livingArea(listing({ livingArea: null }), house, rules).status, "not_checked");
});

test("living area: condos are checked both ways", () => {
  assert.equal(livingArea(listing({ type: "Condo", livingArea: 840 }), condo, rules).status, "ok");
  assert.equal(livingArea(listing({ type: "Condo", livingArea: 700 }), condo, rules).status, "flag", "-16%");
  assert.equal(livingArea(listing({ type: "Condo", livingArea: 950 }), condo, rules).status, "flag", "+14%");
});

test("year built: one-year tolerance", () => {
  assert.equal(yearBuilt(listing({ yearBuilt: 2023 }), house, rules).status, "ok");
  assert.equal(yearBuilt(listing({ yearBuilt: 2024 }), house, rules).status, "ok");
  assert.equal(yearBuilt(listing({ yearBuilt: 2019 }), house, rules).status, "flag");
});

test("lot size: tolerance and condo skip", () => {
  assert.equal(lotSize(listing({ lotSqFt: 8276 }), house, rules).status, "ok", "0.19 acre rounding");
  assert.equal(lotSize(listing({ lotSqFt: 10890 }), house, rules).status, "flag", "0.25 acre, +34%");
  assert.equal(lotSize(listing({ lotSqFt: 8600 }), house, rules).status, "ok", "+5.7%");
  assert.equal(lotSize(listing({ type: "Condo", lotSqFt: 50000 }), condo, rules).status, "not_checked");
});

test("use code: listing type vs DOR code", () => {
  assert.equal(useCode(listing({ type: "Single Family" }), house, rules).status, "ok");
  assert.equal(useCode(listing({ type: "Condo" }), condo, rules).status, "ok");
  assert.equal(useCode(listing({ type: "Single Family" }), condo, rules).status, "flag");
  assert.equal(useCode(listing({ type: "Land" }), house, rules).status, "flag");
});

test("last sale: resale within 12 months is flagged; sales outside the window are info", () => {
  const r = lastSale(listing({ listDate: "2026-09-15", listPrice: 525000 }), resale, rules, { salesWindow: "2025-01 to 2026-09" });
  assert.equal(r.status, "flag");
  assert.match(r.record, /Mar 2026, \$480,000/);
  assert.match(r.note, /about 6 month/);
  const later = lastSale(listing({ listDate: "2027-06-01" }), resale, rules);
  assert.equal(later.status, "info", "15 months later");
  assert.equal(lastSale(listing(), house, rules).record, "none");
});

test("homestead and value: shows the cap that a sale resets", () => {
  const r = homesteadValue(listing({ listPrice: 650000 }), record(PCN.houseWpb), rules);
  assert.equal(r.status, "info");
  assert.match(r.record, /homestead: yes/);
  assert.match(r.note, /\$147,129/); // 602,054 just value - 454,925 assessed
});

test("beds, baths, pool are reported as not checked (no allowed source)", () => {
  const out = notChecked(listing({ beds: 3, baths: 2, pool: true }), house, rules);
  assert.deepEqual(out.map((c) => c.status), ["not_checked", "not_checked", "not_checked"]);
  assert.equal(out[2].listing, "yes");
});

test("private signals: owner abroad, entity owner with owner-occupied remarks, change after listing", () => {
  const c = fraudSignals(listing({ type: "Condo" }), condo, rules);
  assert.ok(c.signals.some((s) => s.id === "ownerAbroad"));
  assert.ok(c.signals.some((s) => s.id === "absenteeOwner"));
  const r = fraudSignals(listing({ listDate: "2026-01-10", remarks: "Lovingly kept, owner occupied since day one." }), resale, rules);
  const ids = r.signals.map((s) => s.id);
  assert.ok(ids.includes("ownerChangedAfterListing"), "Mar 2026 sale after Jan 2026 listing");
  assert.ok(ids.includes("entityOwnerButOwnerOccupiedRemarks"));
  assert.ok(r.closerLook);
  const h = fraudSignals(listing({ listPrice: 2400000 }), house, rules);
  assert.equal(h.score, 0, "homesteaded owner living there: nothing to see");
});

test("private signals never include owner names or mailing addresses", () => {
  const all = JSON.stringify([fraudSignals(listing({ type: "Condo" }), condo, rules), runChecks(listing({ listDate: "2026-01-10" }), resale, config)]);
  for (const s of ["SAMPLE", "EXAMPLE", "TORONTO"]) assert.ok(!all.includes(s), `found ${s}`);
});
