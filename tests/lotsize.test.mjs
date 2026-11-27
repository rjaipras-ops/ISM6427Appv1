import { test } from "node:test";
import assert from "node:assert/strict";
import { lotSizeSuspect, checkLot, SQFT_PER_ACRE } from "../js/lotsize.js";

const L = (price, acres) => ({ ListPrice: price, demo: { LotSizeSquareFeet: Math.round(acres * SQFT_PER_ACRE) } });

test("square feet typed as acres are caught (examples from the live site)", () => {
  for (const [price, acres] of [[34000, 54450], [69000, 47480], [1450000, 43560], [5200000, 42949], [3500000, 83135], [37000, 10000]]) {
    const l = checkLot(L(price, acres));
    assert.equal(l.demo.LotSizeSquareFeet, null, `${acres} acres at ${price}`);
    assert.equal(l.demo.LotSizeListedAcres, acres);
  }
});

test("real lots are left alone", () => {
  for (const [price, acres] of [[450000, 0.25], [1200000, 5], [6000000, 1356], [250000, 2.5], [118000, 39], [90000, 0]]) {
    const l = checkLot(L(price, acres));
    assert.ok(l.demo.LotSizeListedAcres == null, `${acres} acres at ${price}`);
  }
  assert.equal(lotSizeSuspect(0, 100000), false);
  assert.equal(lotSizeSuspect(20 * SQFT_PER_ACRE, 0), false, "no price: can't judge");
});

test("checkLot is idempotent", () => {
  const l = checkLot(checkLot(L(34000, 54450)));
  assert.equal(l.demo.LotSizeListedAcres, 54450);
  assert.equal(l.demo.LotSizeSquareFeet, null);
});
