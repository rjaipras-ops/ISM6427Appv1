// Property lookup by address, for any home in Florida
// (not just homes in Toured's listing data). Used by the Toured panel on the
// MLS Search page: a visitor pastes an address from the Flexmls search and gets
// public records + tour reviews for that home.
//
// 1. Locate the address with the U.S. Census Bureau geocoder (free, no key).
// 2. Find the county parcel at that point (Florida DOR statewide parcel layer) and
//    match it by street + unit.
// Reviews are keyed by the parcel ("P-<county#>-<parcel id>"), which never changes,
// so they carry over to the home's MLS listing page once the Spark feed is live.

import { parcelsAt, parcelShape, toParcel, addressKey, fullSitus } from "./parcels.mjs";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
// Florida Department of Revenue county numbers.
const COUNTY_BY_CO_NO = { 11: "Alachua", 12: "Baker", 13: "Bay", 14: "Bradford", 15: "Brevard", 16: "Broward", 17: "Calhoun", 18: "Charlotte", 19: "Citrus", 20: "Clay", 21: "Collier", 22: "Columbia", 23: "Miami-Dade", 24: "DeSoto", 25: "Dixie", 26: "Duval", 27: "Escambia", 28: "Flagler", 29: "Franklin", 30: "Gadsden", 31: "Gilchrist", 32: "Glades", 33: "Gulf", 34: "Hamilton", 35: "Hardee", 36: "Hendry", 37: "Hernando", 38: "Highlands", 39: "Hillsborough", 40: "Holmes", 41: "Indian River", 42: "Jackson", 43: "Jefferson", 44: "Lafayette", 45: "Lake", 46: "Lee", 47: "Leon", 48: "Levy", 49: "Liberty", 50: "Madison", 51: "Manatee", 52: "Marion", 53: "Martin", 54: "Monroe", 55: "Nassau", 56: "Okaloosa", 57: "Okeechobee", 58: "Orange", 59: "Osceola", 60: "Palm Beach", 61: "Pasco", 62: "Pinellas", 63: "Polk", 64: "Putnam", 65: "St. Johns", 66: "St. Lucie", 67: "Santa Rosa", 68: "Sarasota", 69: "Seminole", 70: "Sumter", 71: "Suwannee", 72: "Taylor", 73: "Union", 74: "Volusia", 75: "Wakulla", 76: "Walton", 77: "Washington" };
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (s) => String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
  .replace(/\b(Ne|Nw|Se|Sw)\b/g, (m) => m.toUpperCase()); // keep directionals ("SE 9 Ave")

export const propertyKey = (coNo, parcelId) => `P-${Number(coNo)}-${String(parcelId).trim().replace(/[^A-Za-z0-9]/g, "")}`;

async function geocode(address) {
  const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
  const res = await fetch(`${CENSUS}?${q}`, { headers: { "User-Agent": "Toured property lookup" } });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
  const j = await res.json();
  return (j.result?.addressMatches || []).map((m) => ({
    matched: m.matchedAddress,
    lng: m.coordinates.x,
    lat: m.coordinates.y,
    zip: m.addressComponents?.zip || "",
    city: m.addressComponents?.city || "",
  }));
}

/** Pulls the unit out of what the visitor typed ("#702", "Apt 5", "Unit B"). */
function unitFrom(input) {
  const m = String(input).match(/(?:#|\bapt\.?|\bunit|\bste\.?|\bsuite)\s*([a-z0-9-]+)/i);
  return m ? m[1].toUpperCase() : "";
}

/** Matches parcels at a point against the visitor's street + unit. */
function chooseParcel(rows, { num, kw, unit, zip }) {
  const ordinal = (w) => w.replace(/^(\d+)(ST|ND|RD|TH)$/, "$1");
  const cands = rows.filter((r) => {
    const a = norm(r.PHY_ADDR1);
    return a.startsWith(`${num} `) && (!kw || a.split(" ").map(ordinal).includes(kw)) && (!zip || Number(r.PHY_ZIPCD) === Number(zip));
  });
  if (!cands.length) return { status: "no_match" };
  const uniq = [...new Map(cands.map((r) => [`${r.CO_NO}|${r.PARCEL_ID}`, r])).values()];
  if (uniq.length === 1) return { status: "matched", parcel: uniq[0] };
  if (unit) {
    const u = unit.replace(/^0+/, "");
    const hit = uniq.filter((r) => {
      const toks = norm(fullSitus(r)).split(" ");
      return toks.at(-1).replace(/^0+/, "") === u || toks.slice(-2).join("").replace(/^0+/, "") === u;
    });
    if (hit.length === 1) return { status: "matched", parcel: hit[0] };
  }
  // Several units at this address (condo / townhomes): let the visitor pick.
  const plain = uniq.filter((r) => norm(fullSitus(r)).length === Math.min(...uniq.map((x) => norm(fullSitus(x)).length)));
  if (plain.length === 1 && !unit) return { status: "matched", parcel: plain[0], building: true };
  return { status: "choose_unit", options: uniq };
}

async function summarize(p, point) {
  const county = COUNTY_BY_CO_NO[p.CO_NO];
  const shape = p._rings || (await parcelShape(p.CO_NO, p.PARCEL_ID).catch(() => null));
  const listingLike = { County: county, ListPrice: null, Longitude: point.lng, Latitude: point.lat };
  // Owner name left out: the home may be listed for sale (BeachesMLS rule 20.3.8).
  return { county, parcel: toParcel(listingLike, p, { shape, includeOwner: false }) };
}

/**
 * Looks up a home. Returns one of:
 *  { status: "matched", property }          property = { key, address, county, lat, lng, parcel }
 *  { status: "choose_unit", units: [...] }   pick one, then call again with { parcelKey }
 *  { status: "not_found" | "outside_area", message }
 */
export async function lookupProperty({ address, parcelKey }) {
  const typed = String(address || "").trim().slice(0, 200);
  if (!typed) return { status: "not_found", message: "Enter an address." };
  const matches = await geocode(typed);
  if (!matches.length) return { status: "not_found", message: "We couldn't find that address. Check the spelling, or include the city and ZIP." };

  const street = typed.split(",")[0];
  // "#702", "Apt 5"… or a unit written right after the street type ("1515 E Broward Blvd 323").
  const unit = unitFrom(typed) || addressKey({ StreetAddress: street }).unit.toUpperCase();
  let lastRows = [];
  for (const m of matches.slice(0, 3)) {
    // Use the visitor's house number + street word, the geocoder's ZIP.
    const { num, kw } = addressKey({ StreetAddress: street.replace(/(?:#|\bapt\.?|\bunit|\bste\.?|\bsuite)\s*[a-z0-9-]+\s*$/i, "").trim(), PostalCode: m.zip });
    let rows = await parcelsAt(m.lng, m.lat, { geometry: true });
    let pick = chooseParcel(rows, { num, kw, unit, zip: m.zip });
    if (pick.status === "no_match") {
      rows = await parcelsAt(m.lng, m.lat, { box: true, geometry: true });
      pick = chooseParcel(rows, { num, kw, unit, zip: m.zip });
    }
    lastRows = rows;
    if (pick.status === "choose_unit") {
      if (parcelKey) {
        const chosen = pick.options.find((r) => propertyKey(r.CO_NO, r.PARCEL_ID) === parcelKey);
        if (chosen) pick = { status: "matched", parcel: chosen };
      }
      if (pick.status === "choose_unit") {
        const options = pick.options.slice(0, 300).map((r) => ({ key: propertyKey(r.CO_NO, r.PARCEL_ID), address: titleCase(fullSitus(r)) }))
          .sort((a, b) => a.address.localeCompare(b.address, "en", { numeric: true }));
        return { status: "choose_unit", address: titleCase(m.matched), units: options };
      }
    }
    if (pick.status === "matched") {
      const p = pick.parcel;
      if (!COUNTY_BY_CO_NO[p.CO_NO]) return { status: "outside_area", message: "Toured covers homes in Florida." };
      const { county, parcel } = await summarize(p, m);
      // Unincorporated parcels carry a county name as the city; use the postal city instead.
      const city = !p.PHY_CITY || /COUNTY|UNINCORPORATED/i.test(p.PHY_CITY) ? m.city : p.PHY_CITY;
      const cityZip = `${titleCase(city)}, FL ${String(p.PHY_ZIPCD || m.zip).slice(0, 5)}`;
      return {
        status: "matched",
        property: {
          key: propertyKey(p.CO_NO, p.PARCEL_ID),
          address: `${titleCase(fullSitus(p))}, ${cityZip}`,
          street: titleCase(fullSitus(p)),
          postalCode: String(p.PHY_ZIPCD || m.zip).slice(0, 5),
          county, lat: m.lat, lng: m.lng,
          building: !!pick.building,
          parcel,
        },
      };
    }
  }
  const outside = lastRows.length && lastRows.every((r) => !COUNTY_BY_CO_NO[r.CO_NO]);
  return outside
    ? { status: "outside_area", message: "Toured covers homes in Florida." }
    : { status: "not_found", message: "We found the address but couldn't match it to a county parcel record. Try including the unit number." };
}
