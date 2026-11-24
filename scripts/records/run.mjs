// The record check for a set of listings in one county: read only the tax-roll rows that could
// match, match each listing, then run the checks, the private signals and the tax estimate.

import { readNal, readSdf } from "./sources/dor.mjs";
import { indexRows, matchListing, listingNumZip, rowNumZip, parcelKey } from "./match.mjs";
import { toRecord } from "./lib/record.mjs";
import { runChecks } from "./checks/index.mjs";
import { situsStreet } from "./lib/address.mjs";


export async function checkCounty(listings, { nalCsv, sdfCsv, config, source }) {
  const wantKeys = new Set(listings.map(listingNumZip).filter(Boolean));
  const wantIds = new Set(listings.map((l) => parcelKey(l.parcelId)).filter(Boolean));
  const rows = await readNal(nalCsv, (get) => wantIds.has(parcelKey(get("PARCEL_ID")))
    || wantKeys.has(rowNumZip({ PHY_ADDR1: get("PHY_ADDR1"), PHY_ADDR2: get("PHY_ADDR2"), PHY_ZIPCD: get("PHY_ZIPCD") })));
  const index = indexRows(rows);
  const matches = listings.map((l) => ({ listing: l, match: matchListing(l, index, config.rules) }));
  const matchedIds = matches.filter((m) => m.match.row).map((m) => m.match.row.PARCEL_ID);
  const sdf = await readSdf(sdfCsv, matchedIds);
  const ctx = { salesWindow: sdf.window };
  return {
    source: { ...source, salesWindow: sdf.window },
    results: matches.map(({ listing, match }) => {
      const base = { listing, match: { method: match.method, confidence: match.confidence, candidates: match.candidates, reason: match.reason || null } };
      if (!match.row) return { ...base, status: "unmatched" };
      const record = toRecord(match.row, sdf.byParcel.get(match.row.PARCEL_ID) || []);
      base.match.parcelId = record.parcelId;
      base.match.situs = situsStreet(match.row);
      if (match.confidence < config.rules.matching.minConfidence) return { ...base, status: "low_confidence" };
      return { ...base, status: "checked", record, ...runChecks(listing, record, config, ctx) };
    }),
  };
}
