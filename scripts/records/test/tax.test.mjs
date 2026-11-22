import { test } from "node:test";
import assert from "node:assert/strict";
import { buyerTaxEstimate, homesteadExemptions } from "../tax.mjs";
import { config, record, PCN } from "./helpers.mjs";

test("config: sourced 2026 numbers", () => {
  assert.equal(config.exemptions.homestead.first.amount, 25000);
  assert.equal(config.exemptions.homestead.additional.amount, 26411);
  assert.equal(config.costOfSale.counties["Palm Beach"].adjustmentPct, 15);
  const pb = config.millage.counties["Palm Beach"];
  assert.deepEqual(pb.byTaxAuthCode["00355"], { name: "UNINCORPORATED COUNTY", total: 16.2192, school: 6.287, nonSchool: 9.9322 });
  assert.equal(pb.byTaxAuthCode["74402"].total, 20.3456);
  for (const s of pb.sources) assert.ok(s.url.startsWith("https://") && /^\d{4}-\d{2}-\d{2}$/.test(s.retrieved));
});

test("homestead exemptions: second exemption only on assessed value above $50,000", () => {
  assert.deepEqual(homesteadExemptions(2125000, config.exemptions), { school: 25000, nonSchool: 51411 });
  assert.deepEqual(homesteadExemptions(59500, config.exemptions), { school: 25000, nonSchool: 34500 });
  assert.deepEqual(homesteadExemptions(20000, config.exemptions), { school: 20000, nonSchool: 20000 });
});

test("seller's current bill uses the roll's taxable values and the district millage", () => {
  // 1,951,381 x 6.287 + 1,924,970 x 9.9322, per $1,000
  const t = buyerTaxEstimate({ price: 2500000, county: "Palm Beach", record: record(PCN.house) }, config);
  assert.equal(t.seller.current, 31388);
  // West Palm Beach district 74402: 424,925 x 6.287 + 398,514 x 14.0586
  assert.equal(buyerTaxEstimate({ price: 650000, county: "Palm Beach", record: record(PCN.houseWpb) }, config).seller.current, 8274);
});

test("buyer's bill: just value = price less 15%, cap reset, with and without homestead", () => {
  const t = buyerTaxEstimate({ price: 2500000, county: "Palm Beach", record: record(PCN.house) }, config);
  assert.equal(t.estimatedJustValue, 2125000);
  assert.equal(t.buyer.nonHomestead, 34466); // 2,125,000 x 16.2192
  assert.equal(t.buyer.homestead, 33798);    // 2,100,000 x 6.287 + 2,073,589 x 9.9322
  const small = buyerTaxEstimate({ price: 70000, county: "Palm Beach", record: record(PCN.condo) }, config);
  assert.equal(small.buyer.homestead, 465);  // 34,500 x 6.287 + 25,000 x 9.9322
});

test("buyer's bill is higher than a capped seller's bill (Save Our Homes reset)", () => {
  const t = buyerTaxEstimate({ price: 650000, county: "Palm Beach", record: record(PCN.houseWpb) }, config);
  assert.ok(t.buyer.homestead > t.seller.current);
});

test("no guessing: missing county millage or district gives no estimate", () => {
  const r = record(PCN.house);
  assert.equal(buyerTaxEstimate({ price: 500000, county: "Broward", record: r }, config).available, false);
  assert.equal(buyerTaxEstimate({ price: 500000, county: "Palm Beach", record: { ...r, taxAuthCode: "99999" } }, config).available, false);
  assert.equal(buyerTaxEstimate({ price: null, county: "Palm Beach", record: r }, config).available, false);
});
