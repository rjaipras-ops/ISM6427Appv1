// Records links on listing pages: parcel IDs, unit parsing and county link formats.
// Formats checked by hand against the county sites with real parcels (Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressKey, countyLinks, parcelKey, cleanParcelId, COUNTY_NO } from "../netlify/lib/parcels.mjs";
import { taxBillLink } from "../js/taxlinks.js";

test("unit numbers after roads whose names contain digits", () => {
  assert.equal(addressKey({ StreetAddress: "2900 N Highway A1a 3a" }).unit, "3A"); // was read as no unit -> wrong condo
  assert.equal(addressKey({ StreetAddress: "603 S State Road 7 1e" }).unit, "1E");
  assert.equal(addressKey({ StreetAddress: "500 Us Highway 1 204" }).unit, "204");
  assert.equal(addressKey({ StreetAddress: "100 State Road 7" }).unit, "", "7 is the road");
  assert.equal(addressKey({ StreetAddress: "500 Us Highway 1" }).unit, "", "1 is the road");
  assert.equal(addressKey({ StreetAddress: "151 Se 1st Street 1107" }).unit, "1107");
});

test("parcel IDs: compared without punctuation, letters kept, Indian River's '.0' kept for links", () => {
  assert.equal(parcelKey("4941-01-AC-0250"), "494101AC0250");
  assert.equal(parcelKey("00-42-45-26-21-122-1020"), "00424526211221020");
  assert.notEqual(parcelKey("474131AA0010"), parcelKey("474131AB0010"));
  assert.equal(parcelKey("31-38-24-00001-1770-00004.0"), parcelKey("31382400001177000004.0"));
  assert.equal(cleanParcelId(" 31382400001177000004.0 "), "31382400001177000004.0");
  assert.equal(COUNTY_NO["Miami-Dade"], 23);
  assert.equal(COUNTY_NO["St. Lucie"], 66);
});

test("county links", () => {
  assert.equal(countyLinks("Miami-Dade", { PARCEL_ID: "01-4138-153-2000" }).appraiser, "https://apps.miamidadepa.gov/PropertySearch/#/?folio=0141381532000");
  assert.equal(countyLinks("Broward", { PARCEL_ID: "494101AC0250" }).bill, "https://broward.county-taxes.com/public/real_estate/parcels/494101-AC-0250/bills");
  assert.equal(countyLinks("St. Lucie", { PARCEL_ID: "142570200050008" }).bill, "https://stlucie.county-taxes.com/public/real_estate/parcels/1425-702-0005-000-8/bills");
  assert.equal(countyLinks("Lee", { PARCEL_ID: "294427L4060220170" }).bill, "https://lee.county-taxes.com/public/real_estate/parcels/294427L4060220170/bills");
  assert.equal(countyLinks("Collier", { PARCEL_ID: "37227960006" }).appraiser, null, "no direct appraiser link: the page searches instead");
  assert.equal(taxBillLink("Collier", "37227960006"), "https://collier.county-taxes.com/public/real_estate/parcels/37227960006/bills");
  assert.equal(taxBillLink("Indian River", "31382400001177000004.0"), "https://indianriver.county-taxes.com/public/real_estate/parcels/31382400001177000004.0/bills");
  assert.equal(taxBillLink("Miami-Dade", "01-4138-153-2000"), "https://miamidade.county-taxes.com/public/real_estate/parcels/0141381532000/bills");
});
