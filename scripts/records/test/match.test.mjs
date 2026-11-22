import { test } from "node:test";
import assert from "node:assert/strict";
import { indexRows, matchListing } from "../match.mjs";
import { addressKey, listingStreet } from "../lib/address.mjs";
import { fixtures, rules, listing, PCN, nalRow } from "./helpers.mjs";

const index = indexRows(fixtures.nal);

test("address keys: street types spelled out, unit words, hyphens and leading zeros", () => {
  assert.equal(addressKey("2800 S Ocean Boulevard 8-G", "33480"), addressKey("2800 S OCEAN BLVD UNIT 8G", "33480"));
  assert.equal(addressKey("6426 Emerald Dunes Drive #0204", "33411"), addressKey("6426 EMERALD DUNES DR UNIT 204", "33411"));
  assert.equal(addressKey("Vero Beach Ln", "33411"), null, "no house number");
  assert.equal(listingStreet({ address: "6426 Emerald Dunes Dr", unit: "204" }), "6426 Emerald Dunes Dr 204");
  assert.equal(listingStreet({ address: "6426 Emerald Dunes Dr 204", unit: "204" }), "6426 Emerald Dunes Dr 204");
});

test("parcel ID match: confidence 1.0", () => {
  const m = matchListing(listing({ parcelId: "00-42-47-17-19-000-1570", address: "1 Wrong St", zip: "33434" }), index, rules);
  assert.equal(m.method, "parcelId");
  assert.equal(m.confidence, 1);
  assert.equal(m.row.PARCEL_ID, PCN.house);
});

test("exact address, single family: confidence 0.8", () => {
  const m = matchListing(listing({ address: "20108 Castle Stuart Avenue", zip: "33434" }), index, rules);
  assert.equal(m.method, "exactAddressNoUnit");
  assert.equal(m.confidence, 0.8);
  assert.equal(m.row.PARCEL_ID, PCN.house);
});

test("exact address with building letter, condo: confidence 0.9", () => {
  const m = matchListing(listing({ type: "Condo", address: "318 Mansfield H", zip: "33434" }), index, rules);
  assert.equal(m.method, "exactAddressWithUnit");
  assert.equal(m.confidence, 0.9);
  assert.equal(m.row.PARCEL_ID, PCN.condo);
});

test("direction missing in the listing: street-keyword match, confidence 0.7", () => {
  const m = matchListing(listing({ address: "17296 Sycamore Drive", zip: "33470" }), index, rules);
  assert.equal(m.method, "streetKeyword");
  assert.equal(m.confidence, 0.7);
  assert.equal(m.row.PARCEL_ID, PCN.resale);
});

test("wrong unit, wrong ZIP, hidden address and duplicates are not matched", () => {
  assert.equal(matchListing(listing({ address: "318 Mansfield G", zip: "33434" }), index, rules).row, null);
  assert.equal(matchListing(listing({ address: "20108 Castle Stuart Ave", zip: "33433" }), index, rules).row, null);
  assert.equal(matchListing(listing({ address: "20108 Castle Stuart Ave", zip: "33434", addressHidden: true }), index, rules).row, null);
  const twin = { ...nalRow(PCN.house), PARCEL_ID: "00424717190009999" };
  const m = matchListing(listing({ address: "20108 Castle Stuart Ave", zip: "33434" }), indexRows([...fixtures.nal, twin]), rules);
  assert.equal(m.method, "ambiguous");
  assert.ok(m.confidence < rules.matching.minConfidence);
});
