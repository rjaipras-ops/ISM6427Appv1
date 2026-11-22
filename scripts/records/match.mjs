// Ties a listing to one tax-roll parcel and says how sure the match is.
// Confidence values come from config/rules.json (matching):
//   parcelId              the listing carries the parcel / folio number and it is in the roll
//   exactAddressWithUnit  number + street + unit + ZIP identical, one parcel, a condo or co-op unit
//   exactAddressNoUnit    number + street + ZIP identical, one parcel, not a unit
//   streetKeyword         same number, distinctive street words and unit, ZIP; street type or
//                         direction written differently ("N Flagler Dr" vs "Flagler Drive")
//   ambiguous             several parcels fit; no checks run
// Checks run only when confidence >= minConfidence.

import { addressKey, coreWords, numZip, listingStreet, situsStreet } from "./lib/address.mjs";

const UNIT_USE_CODES = new Set(["004", "005"]);
const digits = (s) => String(s || "").replace(/\D/g, "");

/** Key used to keep only plausible NAL rows while streaming a county file. */
export const listingNumZip = (l) => numZip(listingStreet(l), l.zip);
export const rowNumZip = (row) => numZip(situsStreet(row), row.PHY_ZIPCD);

/** Groups raw NAL rows for lookup by parcel ID and by house number + ZIP. */
export function indexRows(rows) {
  const byParcel = new Map(), byNumZip = new Map();
  for (const r of rows) {
    byParcel.set(digits(r.PARCEL_ID), r);
    const k = rowNumZip(r);
    if (!k) continue;
    if (!byNumZip.has(k)) byNumZip.set(k, []);
    byNumZip.get(k).push(r);
  }
  return { byParcel, byNumZip };
}

const uniqueParcels = (rows) => [...new Map(rows.map((r) => [digits(r.PARCEL_ID), r])).values()];

/**
 * Returns { method, confidence, row, candidates, reason }. `row` is the raw NAL row (or null).
 * `rules` is config/rules.json.
 */
export function matchListing(l, index, rules) {
  const c = rules.matching;
  if (l.parcelId) {
    const r = index.byParcel.get(digits(l.parcelId));
    if (r) return { method: "parcelId", confidence: c.parcelId, row: r, candidates: 1 };
  }
  if (l.addressHidden) return { method: "none", confidence: 0, row: null, candidates: 0, reason: "address withheld by the listing" };
  const street = listingStreet(l);
  const k = numZip(street, l.zip);
  if (!k) return { method: "none", confidence: 0, row: null, candidates: 0, reason: "no house number or ZIP" };
  const cands = index.byNumZip.get(k) || [];
  if (!cands.length) return { method: "none", confidence: 0, row: null, candidates: 0, reason: "no parcel with this house number and ZIP" };

  const full = addressKey(street, l.zip);
  const exact = uniqueParcels(cands.filter((r) => addressKey(situsStreet(r), r.PHY_ZIPCD) === full));
  if (exact.length === 1) {
    const isUnit = UNIT_USE_CODES.has(String(exact[0].DOR_UC).padStart(3, "0"));
    return isUnit
      ? { method: "exactAddressWithUnit", confidence: c.exactAddressWithUnit, row: exact[0], candidates: cands.length }
      : { method: "exactAddressNoUnit", confidence: c.exactAddressNoUnit, row: exact[0], candidates: cands.length };
  }
  if (exact.length > 1) return { method: "ambiguous", confidence: c.ambiguous, row: null, candidates: exact.length, reason: `${exact.length} parcels share this exact address` };

  const core = coreWords(street, l.zip);
  const loose = uniqueParcels(cands.filter((r) => coreWords(situsStreet(r), r.PHY_ZIPCD) === core));
  if (loose.length === 1) return { method: "streetKeyword", confidence: c.streetKeyword, row: loose[0], candidates: cands.length };
  if (loose.length > 1) return { method: "ambiguous", confidence: c.ambiguous, row: null, candidates: loose.length, reason: `${loose.length} parcels fit the street words` };
  return { method: "none", confidence: 0, row: null, candidates: cands.length, reason: `${cands.length} parcel(s) at this number and ZIP, none with the same street and unit` };
}
