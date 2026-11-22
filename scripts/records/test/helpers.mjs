import { readFileSync } from "node:fs";
import { loadConfig } from "../config/index.mjs";
import { toRecord } from "../lib/record.mjs";

export const fixtures = JSON.parse(readFileSync(new URL("./fixtures/palm-beach-2026.json", import.meta.url), "utf8"));
export const config = loadConfig(2026);
export const rules = config.rules;

export const nalRow = (id) => fixtures.nal.find((r) => r.PARCEL_ID === id);
export const record = (id) => toRecord(nalRow(id), fixtures.sdf.filter((s) => s.PARCEL_ID === id));

// The four fixture parcels (real 2026 Palm Beach roll values; owner fields made up).
export const PCN = {
  house: "00424717190001570",   // 20108 Castle Stuart Ave, Boca Raton: single family, homestead, district 00355
  houseWpb: "74424321100009050", // 2172 Vero Beach Ln, West Palm Beach: single family, homestead with SOH cap, district 74402
  condo: "00424708100083180",   // 318 Mansfield H, Boca Raton (Century Village): condo, no homestead
  resale: "00404314000001070",  // 17296 W Sycamore Dr, Loxahatchee: bought Jul 2025, sold again Mar 2026
};

/** A listing in the shape sources/listings.mjs produces, with overrides. */
export const listing = (o = {}) => ({
  id: "TEST1", mls: "RX0000000", county: "Palm Beach", address: "", unit: null, zip: "", city: "", type: "Single Family",
  livingArea: null, yearBuilt: null, lotSqFt: null, beds: 3, baths: 2, pool: false, listPrice: 500000,
  listDate: "2026-10-01", remarks: "", taxAnnual: null, parcelId: null, addressHidden: false, ...o,
});
