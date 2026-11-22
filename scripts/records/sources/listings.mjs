// Listings for the record check, in one shape:
//   { id, mls, county, address, unit, zip, city, type, livingArea, yearBuilt, lotSqFt, beds, baths,
//     pool, listPrice, listDate, remarks, taxAnnual, parcelId, addressHidden }
//
// fromSite() reads the public itoured.com endpoints (the same data any visitor's browser gets),
// so the dry run needs no MLS credentials. The scheduled job (step 3) will read the feed directly.

const SITE = process.env.RECORDS_SITE_URL || "https://itoured.com";
const UA = { "User-Agent": "iToured record check (dry run)" };

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Compact index rows -> objects keyed by field name. */
export async function siteIndex() {
  const d = await getJson(`${SITE}/api/idx/listings`);
  return d.rows.map((r) => Object.fromEntries(d.fields.map((f, i) => [f, r[i]])));
}

/** Full listing record from the site, normalized. */
export async function siteListing(id) {
  const x = await getJson(`${SITE}/api/idx/listing/${encodeURIComponent(id)}`);
  return normalize(x);
}

export function normalize(x) {
  const d = x.demo || {};
  const pick = (k) => x[k] ?? x[`demo.${k}`] ?? d[k] ?? null;
  return {
    id: x.ListingKey || x.ListingId,
    mls: x.MlsNumber || null,
    county: x.County,
    address: x.StreetAddress || String(x.UnparsedAddress || "").split(",")[0],
    unit: x.UnitNumber || null,
    zip: String(x.PostalCode || "").slice(0, 5),
    city: x.City,
    type: x.PropertyType,
    livingArea: x.LivingArea ?? null,
    yearBuilt: pick("YearBuilt"),
    lotSqFt: pick("LotSizeSquareFeet"),
    beds: x.BedroomsTotal ?? null,
    baths: x.BathroomsTotalInteger ?? null,
    pool: pick("PoolPrivateYN"),
    listPrice: x.ListPrice ?? null,
    listDate: pick("ListingContractDate"),
    remarks: pick("PublicRemarks") || "",
    taxAnnual: pick("TaxAnnualAmount"),
    parcelId: x.ParcelNumber || null,
    addressHidden: !!x.AddressHidden,
  };
}
