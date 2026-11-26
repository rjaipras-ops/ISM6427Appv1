import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, usableSale, median } from "../scripts/records/market.mjs";
import { mlsStats, salesSummary, draftReport, weekOf } from "../netlify/lib/market.mjs";
import { INDEX_FIELDS, INDEX_FLAGS } from "../netlify/lib/index-format.mjs";

const sale = (id, yr, mo, prc, extra = {}) => ({ PARCEL_ID: id, SALE_YR: String(yr), SALE_MO: String(mo), SALE_PRC: String(prc), QUAL_CD: "01", VI_CD: "I", MULTI_PAR_SAL: "", ...extra });

test("only qualified, improved, single-parcel sales count", () => {
  assert.ok(usableSale(sale("a", 2026, 1, 100)));
  assert.ok(!usableSale(sale("a", 2026, 1, 100, { QUAL_CD: "11" })));
  assert.ok(!usableSale(sale("a", 2026, 1, 100, { VI_CD: "V" })));
  assert.ok(!usableSale(sale("a", 2026, 1, 100, { MULTI_PAR_SAL: "D" })));
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
});

test("aggregate: months (newest dropped as incomplete) and cities", () => {
  const parcels = new Map([["a", { group: "single-family", city: "Jupiter" }], ["b", { group: "condo", city: "Jupiter" }]]);
  const sales = [];
  for (let i = 0; i < 12; i++) sales.push(sale("a", 2026, 6, 500000 + i * 1000));
  sales.push(sale("b", 2026, 6, 200000), sale("a", 2026, 7, 900000), sale("z", 2026, 6, 1));
  const r = aggregate(parcels, sales);
  assert.equal(r.window, "2026-06 to 2026-06");
  assert.deepEqual(r.months.map((m) => [m.group, m.count]), [["condo", 1], ["single-family", 12]]);
  assert.deepEqual(r.cities.rows.map((c) => [c.city, c.group, c.count]), [["Jupiter", "single-family", 12]], "cities need 10+ sales");
  assert.deepEqual(r.summary.find((x) => x.group === "single-family"), { group: "single-family", from: "2026-06", to: "2026-06", count: 12, median: 505500, priorMedian: null });
  assert.deepEqual(salesSummary(r)[0].sales, 12);
});

test("MLS stats from index rows", () => {
  const col = (f) => INDEX_FIELDS.indexOf(f);
  const row = (county, type, price, area, dom, reduced) => {
    const r = INDEX_FIELDS.map(() => null);
    r[col("County")] = county; r[col("PropertyType")] = type; r[col("ListPrice")] = price; r[col("LivingArea")] = area; r[col("demo.DaysOnMarket")] = dom;
    r.push(reduced ? 1 << INDEX_FLAGS.indexOf("demo.PriceReduced") : 0);
    return r;
  };
  const s = mlsStats({ a: row("Broward", "Single Family", 500000, 2000, 3, true), b: row("Broward", "Single Family", 700000, 2000, 30, false),
    c: row("Broward", "Land", 1, 0, 1, false), d: row("Lee", "Condo", 1, 1, 1, false) }, ["Broward"]);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0], { county: "Broward", group: "single-family", active: 2, newThisWeek: 1, medianPrice: 600000, medianPricePerSqFt: 300, medianDaysOnMarket: 17, reducedShare: 50 });
});

test("draft: publishable part has public records only, in both languages", () => {
  const months = [];
  for (const y of [2025, 2026]) for (const m of [6, 7, 8]) months.push({ ym: `${y}-0${m}`, group: "single-family", count: 100, median: y === 2025 ? 500000 : 550000 });
  const sales = { date: "2026-11-26", counties: { "Palm Beach": { months } } };
  assert.deepEqual(salesSummary(sales.counties["Palm Beach"])[0], { group: "single-family", from: "2026-06", to: "2026-08", sales: 300, median: 550000, yoy: 10 });
  const mls = [{ county: "Palm Beach", group: "condo", active: 1234, newThisWeek: 50, medianPrice: 300000, medianPricePerSqFt: 250, medianDaysOnMarket: 60, reducedShare: 30 }];
  const d = draftReport({ week: "2026-11-23", sales, mls, prevMls: [{ ...mls[0], active: 1200 }] });
  assert.match(d.en.public, /Palm Beach County single-family homes: 300 qualified sales in Jun 2026–Aug 2026; median price \$550,000 \(\+10% vs/);
  assert.match(d.es.public, /Condado de Palm Beach, casas unifamiliares: 300 ventas calificadas/);
  for (const t of [d.en.public, d.es.public]) assert.ok(!/1,234|1234|BeachesMLS/.test(t), "MLS numbers kept out of the publishable text");
  assert.match(d.en.private, /DO NOT PUBLISH/);
  assert.match(d.en.private, /1,234 for sale, \+34 since last week/);
});

test("weekOf returns the Monday", () => {
  assert.equal(weekOf(new Date("2026-11-26T15:00:00Z")), "2026-11-23");
  assert.equal(weekOf(new Date("2026-11-23T15:00:00Z")), "2026-11-23");
  assert.equal(weekOf(new Date("2026-11-29T15:00:00Z")), "2026-11-23");
});
