import { test } from "node:test";
import assert from "node:assert/strict";
import { ringsFromIsochrone, commuteArea } from "../netlify/lib/commute.mjs";
import { inCommuteArea, matches, defaults, setCommuteArea, chipsFor } from "../js/filters.js";

const square = [[-80.2, 26.0], [-80.1, 26.0], [-80.1, 26.2], [-80.2, 26.2], [-80.2, 26.0]];

test("isochrone GeoJSON -> outer rings (Polygon and MultiPolygon)", () => {
  assert.deepEqual(ringsFromIsochrone({ features: [{ geometry: { type: "Polygon", coordinates: [square] } }] }), [square]);
  assert.equal(ringsFromIsochrone({ features: [{ geometry: { type: "MultiPolygon", coordinates: [[square], [square]] } }] }).length, 2);
  assert.equal(ringsFromIsochrone({ features: [] }), null);
});

test("homes inside the area pass the filter; the chip names the place and time", () => {
  assert.equal(inCommuteArea(26.1, -80.15, [square]), true);
  assert.equal(inCommuteArea(26.3, -80.15, [square]), false);
  const f = { ...defaults(), commuteQ: "Las Olas Blvd", commuteMin: 30, commuteMode: "drive" };
  const home = (lat, lng) => ({ ListingId: "x", ListPrice: 5e5, BedroomsTotal: 3, BathroomsTotalInteger: 2, PropertyType: "Single Family", County: "Broward",
    LivingArea: 1500, Latitude: lat, Longitude: lng, UnparsedAddress: "", Neighborhood: "", PostalCode: "", demo: { StandardStatus: "Active" } });
  setCommuteArea([square]);
  assert.equal(matches(home(26.1, -80.15), f), true);
  assert.equal(matches(home(26.5, -80.15), f), false);
  setCommuteArea(null);
  assert.equal(matches(home(26.5, -80.15), f), true, "until the area loads, nothing is hidden");
  assert.ok(chipsFor(f).some((c) => c.label === "≤ 30 min drive to Las Olas Blvd"));
});

test("commute search is off without a key", async () => {
  delete process.env.ORS_API_KEY;
  assert.deepEqual(await commuteArea("Las Olas", 30, "drive"), { error: "off" });
});
