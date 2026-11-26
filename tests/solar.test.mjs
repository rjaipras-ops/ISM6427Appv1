import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, solarForListing } from "../netlify/lib/solar.mjs";

// Shape of Google's buildingInsights:findClosest response (fields used by the site).
const sample = {
  imageryDate: { year: 2024, month: 3, day: 9 }, imageryQuality: "HIGH",
  solarPotential: {
    maxArrayPanelsCount: 42, maxArrayAreaMeters2: 82.1, maxSunshineHoursPerYear: 1885.4, panelCapacityWatts: 400,
    solarPanelConfigs: [
      { panelsCount: 4, yearlyEnergyDcKwh: 2900.2 }, { panelsCount: 18, yearlyEnergyDcKwh: 12650.6 },
      { panelsCount: 30, yearlyEnergyDcKwh: 20480.1 }, { panelsCount: 42, yearlyEnergyDcKwh: 27950.9 },
    ],
  },
};

test("solar summary: typical ~7 kW system, roof maximum, sunshine", () => {
  const s = summarize(sample);
  assert.equal(s.sunHoursPerYear, 1885);
  assert.equal(s.maxPanels, 42);
  assert.equal(s.roofAreaSqFt, 884);
  assert.deepEqual(s.typical, { panels: 18, kw: 7.2, kwhPerYear: 12651 });
  assert.deepEqual(s.max, { panels: 42, kw: 16.8, kwhPerYear: 27951 });
  assert.equal(s.imageryDate, "2024-03");
  assert.equal(summarize({}), null);
  assert.equal(summarize({ solarPotential: { maxArrayPanelsCount: 0 } }), null);
});

test("solar is off without a key (no calls, no section)", async () => {
  delete process.env.GOOGLE_SOLAR_API_KEY;
  assert.deepEqual(await solarForListing("ANY"), { available: false, reason: "off" });
});
