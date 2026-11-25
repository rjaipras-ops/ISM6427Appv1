// Public parcel records from the Florida Department of Revenue statewide parcel
// layer (no API key). Shared by the build scripts (demo data) and the IDX
// functions (live MLS listings, looked up when a listing is first opened).
//
// IDX compliance: BeachesMLS rule 20.3.8 prohibits displaying a seller's or
// occupant's name. `toParcel(..., { includeOwner: false })` leaves the owner out;
// the county property-appraiser link (Links.appraiser) shows it on the county's site.

export const PARCEL_LAYER =
  "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

// Owner mailing address fields are deliberately never requested.
export const PARCEL_FIELDS = [
  "PARCEL_ID", "CO_NO", "ALT_KEY", "ASMNT_YR", "DOR_UC", "JV", "AV_SD", "AV_NSD", "TV_SD", "TV_NSD", "JV_HMSTD",
  "LND_VAL", "LND_SQFOOT", "ACT_YR_BLT", "EFF_YR_BLT", "TOT_LVG_AR", "NO_RES_UNT",
  "SALE_PRC1", "SALE_YR1", "SALE_MO1", "QUAL_CD1", "SALE_PRC2", "SALE_YR2", "SALE_MO2", "QUAL_CD2",
  "OWN_NAME", "PHY_ADDR1", "PHY_ADDR2", "PHY_CITY", "PHY_ZIPCD",
];

/** Parcel ID as the county writes it (kept as is: Indian River IDs really end in ".0"). */
export const cleanParcelId = (id) => String(id ?? "").trim();
/** Comparison key: letters and digits only (Broward folios contain letters: 474131AA0010). */
export const parcelKey = (id) => cleanParcelId(id).toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Situs address incl. unit. Broward keeps condo unit numbers in PHY_ADDR2 ("#702"). */
export const fullSitus = (p) => `${String(p.PHY_ADDR1 || "").trim()} ${String(p.PHY_ADDR2 || "").trim()}`.trim();

export const DOR_USE = {
  "000": "Vacant residential", "001": "Single family", "002": "Mobile home", "003": "Multi-family (10+ units)",
  "004": "Condominium", "005": "Co-op", "006": "Retirement home", "007": "Misc. residential",
  "008": "Multi-family (2-9 units)", "009": "Residential common area", "010": "Vacant commercial",
};

// Approximate 2025 combined millage (per $1,000 of taxable value), used only for
// the "estimated tax" figures. School levies apply to TV_SD, the rest to TV_NSD.
export const MILLAGE = {
  Broward: { school: 5.6, other: 13.6 },
  "Palm Beach": { school: 6.3, other: 12.6 },
  "St. Lucie": { school: 6.2, other: 14.0 },
};

// Florida DOR sale qualification code "01" = qualified (arm's-length) sale.
const saleOf = (price, yr, mo, q) => (price > 100 && yr > 0
  ? { price, year: yr, month: Number(mo) || null, qualified: String(q).trim() === "01" }
  : null);

/** County tax-collector and property-appraiser links (deep links verified Nov 2026). */
export function countyLinks(county, p) {
  const id = cleanParcelId(p.PARCEL_ID);
  const alt = String(p.ALT_KEY || "").trim();
  switch (county) {
    case "Broward":
      return {
        bill: /^[0-9A-Za-z]{12}$/.test(id)
          ? `https://broward.county-taxes.com/public/real_estate/parcels/${id.slice(0, 6)}-${id.slice(6, 8)}-${id.slice(8)}/bills`
          : "https://county-taxes.net/broward/property-tax",
        appraiser: `https://www.bcpa.net/RecInfo.asp?URL_Folio=${encodeURIComponent(id)}`,
      };
    case "Palm Beach":
      return {
        bill: "https://pbctax.publicaccessnow.com/PropertyTax.aspx", // no per-parcel links on this site
        appraiser: `https://pbcpao.gov/Property/Details?parcelId=${encodeURIComponent(id.replace(/\D/g, ""))}`,
      };
    case "St. Lucie":
      return {
        bill: id.replace(/\D/g, "").length === 15
          ? `https://stlucie.county-taxes.com/public/real_estate/parcels/${id.replace(/\D/g, "").replace(/^(\d{4})(\d{3})(\d{4})(\d{3})(\d)$/, "$1-$2-$3-$4-$5")}/bills`
          : "https://county-taxes.net/stlucie/property-tax",
        // St. Lucie record cards are keyed by the county account number (DOR ALT_KEY).
        appraiser: alt && /^\d+$/.test(alt) ? `https://apps.paslc.gov/rerecordcard/${alt}` : "https://apps.paslc.gov/property-search/",
      };
    case "Miami-Dade": {
      const folio = id.replace(/\D/g, "");
      return {
        bill: folio.length === 13 ? `https://miamidade.county-taxes.com/public/real_estate/parcels/${folio}/bills` : "https://county-taxes.net/fl-miamidade/property-tax",
        appraiser: folio.length === 13 ? `https://apps.miamidadepa.gov/PropertySearch/#/?folio=${folio}` : "https://apps.miamidadepa.gov/PropertySearch/",
      };
    }
    case "Indian River":
      return {
        bill: id ? `https://indianriver.county-taxes.com/public/real_estate/parcels/${encodeURIComponent(id)}/bills` : null,
        appraiser: id ? `https://qpublic.schneidercorp.com/Application.aspx?AppID=1109&LayerID=27655&PageTypeID=4&PageID=11279&KeyValue=${encodeURIComponent(id)}` : null,
      };
    case "Monroe": {
      // Monroe's tax site is keyed by the account number (DOR ALT_KEY); the appraiser by the 14-digit RE number.
      const re = id.replace(/\D/g, "").slice(-14);
      return {
        bill: alt && /^\d+$/.test(alt) ? `https://monroe.county-taxes.com/public/real_estate/parcels/${alt}/bills` : "https://county-taxes.net/fl-monroe/property-tax",
        appraiser: re.length === 14 ? `https://qpublic.schneidercorp.com/Application.aspx?AppID=605&LayerID=9946&PageTypeID=4&KeyValue=${re.slice(0, 8)}-${re.slice(8)}` : null,
      };
    }
    // Lee and Collier: tax bills open by parcel number (TaxSys). Their appraiser sites can't be opened
    // to one parcel by its number (checked Nov 2026), so the page searches for it instead.
    case "Lee":
    case "Collier": {
      const c = id.replace(/[^0-9A-Za-z]/g, "");
      return { bill: c ? `https://${county.toLowerCase()}.county-taxes.com/public/real_estate/parcels/${c}/bills` : null, appraiser: null };
    }
    case "Martin":
      return { bill: "https://county-taxes.net/fl-martin", appraiser: null }; // no per-parcel tax links on Martin's site
    default:
      return { bill: null, appraiser: null };
  }
}

/** True if the listing's point is inside the outline (or within ~60 m of it). */
export function shapeFits(rings, lng, lat) {
  const inside = (ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  if (rings.some(inside)) return true;
  const pts = rings.flat();
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  return Math.hypot((cx - lng) * 99000, (cy - lat) * 111000) < 60;
}

/** Builds the app's `Parcel` object from a DOR record. */
export function toParcel(listing, p, { shape = null, includeOwner = true } = {}) {
  const rate = MILLAGE[listing.County] || MILLAGE.Broward;
  return {
    ParcelId: cleanParcelId(p.PARCEL_ID),
    AltKey: String(p.ALT_KEY || "").trim() || null,
    AssessmentYear: p.ASMNT_YR,
    LandUse: DOR_USE[p.DOR_UC] || `DOR code ${p.DOR_UC}`,
    Owner: includeOwner ? (p.OWN_NAME || "").trim() || null : null,
    SitusAddress: fullSitus(p),
    JustValue: p.JV,
    AssessedValue: p.AV_SD,
    TaxableValueSchool: p.TV_SD,
    TaxableValueNonSchool: p.TV_NSD,
    LandValue: p.LND_VAL,
    Homestead: p.JV_HMSTD > 0,
    YearBuilt: p.ACT_YR_BLT || null,
    EffectiveYearBuilt: p.EFF_YR_BLT || null,
    LivingAreaSqFt: p.TOT_LVG_AR || null,
    LotSqFt: p.LND_SQFOOT || null,
    LastSale: saleOf(p.SALE_PRC1, p.SALE_YR1, p.SALE_MO1, p.QUAL_CD1),
    PriorSale: saleOf(p.SALE_PRC2, p.SALE_YR2, p.SALE_MO2, p.QUAL_CD2),
    EstTaxCurrentOwner: Math.round((p.TV_SD * rate.school + p.TV_NSD * rate.other) / 1000),
    // A sale resets the assessed value to market (Save Our Homes cap is lost),
    // so a buyer's bill is based on roughly the purchase price.
    EstTaxNewBuyer: listing.ListPrice ? Math.round((listing.ListPrice * 0.85 * (rate.school + rate.other)) / 1000) : null,
    Links: countyLinks(listing.County, p),
    Shape: shape && shapeFits(shape, listing.Longitude, listing.Latitude) ? shape : null,
  };
}

/* ---------- matching a listing to its parcel ---------- */

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);
const SUFFIX = new Set(["ST", "STREET", "AVE", "AVENUE", "AV", "RD", "ROAD", "DR", "DRIVE", "LN", "LANE", "CT", "COURT",
  "CIR", "CIRCLE", "BLVD", "BOULEVARD", "TER", "TERRACE", "TERR", "PL", "PLACE", "WAY", "PKWY", "PARKWAY", "TRL", "TRAIL",
  "HWY", "HIGHWAY", "PT", "POINT", "LOOP", "RUN", "PATH", "ROW", "MNR", "MANOR", "TRCE", "TRACE", "CV", "COVE", "SQ"]);
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const ordinal = (w) => w.replace(/^(\d+)(ST|ND|RD|TH)$/, "$1");

export function addressKey(l) {
  let street = norm(String(l.StreetAddress).replace(/\s(#\s?\w[\w-]*|Unit \w+|Apt \w+|Lot \w+)$/i, ""));
  // MLS addresses often put the unit right after the street type with no "#":
  // "1515 E BROWARD BOULEVARD 323", "2100 VAN BUREN STREET 322", "100 OCEAN DR N 4B".
  let trailingUnit = "";
  {
    const w = street.split(" ");
    const last = w[w.length - 1], prev = w[w.length - 2];
    // Roads whose names contain numbers: "N HIGHWAY A1A 3A", "S STATE ROAD 7 1E", "US HIGHWAY 1 204".
    const route = prev === "A1A" || (/^\d+$/.test(prev) && ["HWY", "HIGHWAY", "US", "SR", "ROAD", "RD", "ROUTE"].includes(w[w.length - 3]));
    // ...but in "100 STATE ROAD 7" or "500 US HIGHWAY 1" the last number is the road, not a unit.
    const lastIsRoad = ["HWY", "HIGHWAY", "US", "SR", "ROUTE"].includes(prev) || (["ROAD", "RD"].includes(prev) && ["STATE", "COUNTY"].includes(w[w.length - 3]));
    if (w.length >= 3 && /\d/.test(last) && last.length <= 6 && !lastIsRoad && (SUFFIX.has(prev) || DIRS.has(prev) || route)) {
      trailingUnit = last;
      street = w.slice(0, -1).join(" ");
    }
  }
  const words = street.split(" ");
  const num = /^\d+$/.test(words[0]) ? words.shift() : "";
  const core = words.map(ordinal).filter((w) => !DIRS.has(w) && !SUFFIX.has(w));
  const kw = core.sort((a, b) => b.length - a.length)[0] || "";
  const unitRaw = (l.UnitNumber || (String(l.StreetAddress).match(/\s(?:#|Unit |Apt |Lot )\s?([\w-]+)$/i) || [])[1] || trailingUnit || "");
  const unit = norm(unitRaw).replace(/\s/g, "").replace(/^#/, "");
  return { num, kw, unit };
}

export function pickParcel(l, rows) {
  const { num, kw, unit } = addressKey(l);
  const cands = rows.filter((r) => {
    const a = norm(r.PHY_ADDR1);
    return a.startsWith(num + " ") && (!kw || a.split(" ").map(ordinal).includes(kw)) && Number(r.PHY_ZIPCD) === Number(l.PostalCode);
  });
  if (!cands.length) return { status: "no_match" };
  if (unit) {
    const u = unit.replace(/^0+/, "");
    const hit = cands.filter((r) => {
      const toks = norm(fullSitus(r)).split(" ");
      const last = toks[toks.length - 1].replace(/^0+/, "");
      return last === u || toks.slice(-2).join("").replace(/^0+/, "") === u;
    });
    const hitIds = new Map(hit.map((r) => [r.PARCEL_ID, r]));
    if (hitIds.size === 1) return { status: "matched", parcel: [...hitIds.values()][0] };
    return { status: hit.length ? "ambiguous" : "unit_not_found", candidates: cands.length };
  }
  const uniq = new Map(cands.map((r) => [r.PARCEL_ID, r]));
  if (uniq.size === 1) return { status: "matched", parcel: [...uniq.values()][0] };
  const sorted = [...uniq.values()].sort((a, b) => norm(fullSitus(a)).length - norm(fullSitus(b)).length);
  if (norm(fullSitus(sorted[0])).length < norm(fullSitus(sorted[1])).length) return { status: "matched", parcel: sorted[0] };
  return { status: "ambiguous", candidates: uniq.size };
}

async function layerQuery(params) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(PARCEL_LAYER, { method: "POST", body: new URLSearchParams({ ...params, f: "json" }), headers: { "User-Agent": "iToured parcel lookup" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
}

/**
 * Parcels at a point (or, as a fallback, in a ~25 m box around it).
 * With { geometry: true } each row also gets `_rings` (outline in [lng, lat]), saving a second request.
 */
export async function parcelsAt(lng, lat, { box = false, geometry: withGeometry = false } = {}) {
  const geometry = box
    ? { geometry: [lng - 0.00025, lat - 0.00025, lng + 0.00025, lat + 0.00025].join(","), geometryType: "esriGeometryEnvelope" }
    : { geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint" };
  const j = await layerQuery({
    ...geometry, inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: PARCEL_FIELDS.join(","), resultRecordCount: "2000",
    ...(withGeometry
      ? { returnGeometry: "true", outSR: "4326", geometryPrecision: "6", maxAllowableOffset: "0.000004" }
      : { returnGeometry: "false" }),
  });
  const round = (n) => Math.round(n * 1e6) / 1e6;
  return j.features.map((f) => (withGeometry && f.geometry?.rings?.length
    ? { ...f.attributes, _rings: f.geometry.rings.map((ring) => ring.map(([x, y]) => [round(x), round(y)])) }
    : f.attributes));
}

/** Outline rings ([[lng, lat], ...]) for one parcel, by county number + parcel ID. */
export async function parcelShape(coNo, parcelId) {
  const j = await layerQuery({
    where: `CO_NO=${Number(coNo)} AND PARCEL_ID='${String(parcelId).trim().replace(/'/g, "''")}'`,
    outFields: "PARCEL_ID", returnGeometry: "true", outSR: "4326", geometryPrecision: "6", maxAllowableOffset: "0.000004",
  });
  const g = j.features[0]?.geometry;
  return g?.rings?.length ? g.rings.map((ring) => ring.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])) : null;
}

// Florida DOR county numbers (2026 NAL/SDF Users Guide, "County Numbers"), by the MLS county name.
export const COUNTY_NO = { Alachua: 11, Baker: 12, Bay: 13, Bradford: 14, Brevard: 15, Broward: 16, Calhoun: 17, Charlotte: 18, Citrus: 19, Clay: 20, Collier: 21, Columbia: 22, "Miami-Dade": 23, DeSoto: 24, Dixie: 25, Duval: 26, Escambia: 27, Flagler: 28, Franklin: 29, Gadsden: 30, Gilchrist: 31, Glades: 32, Gulf: 33, Hamilton: 34, Hardee: 35, Hendry: 36, Hernando: 37, Highlands: 38, Hillsborough: 39, Holmes: 40, "Indian River": 41, Jackson: 42, Jefferson: 43, Lafayette: 44, Lake: 45, Lee: 46, Leon: 47, Levy: 48, Liberty: 49, Madison: 50, Manatee: 51, Marion: 52, Martin: 53, Monroe: 54, Nassau: 55, Okaloosa: 56, Okeechobee: 57, Orange: 58, Osceola: 59, "Palm Beach": 60, Pasco: 61, Pinellas: 62, Polk: 63, Putnam: 64, "St. Johns": 65, "St. Lucie": 66, "Santa Rosa": 67, Sarasota: 68, Seminole: 69, Sumter: 70, Suwannee: 71, Taylor: 72, Union: 73, Volusia: 74, Wakulla: 75, Walton: 76, Washington: 77 };
const countyNo = (name) => COUNTY_NO[String(name || "").replace(/^Saint /, "St. ").replace(/^Desoto$/i, "DeSoto")] || null;

/** Parcels with this ID (in the listing's county when known; IDs are stored in more than one format). */
async function parcelsById(id, county) {
  const vals = [...new Set([cleanParcelId(id), parcelKey(id)])].filter(Boolean).map((v) => `'${v.replace(/'/g, "''")}'`);
  const co = countyNo(county);
  if (!vals.length) return [];
  const j = await layerQuery({ where: `${co ? `CO_NO=${co} AND ` : ""}PARCEL_ID IN (${vals.join(",")})`, outFields: PARCEL_FIELDS.join(","), returnGeometry: "false" });
  return j.features.map((f) => f.attributes);
}

/** The listing's house number agrees with the parcel's situs (guards against a mistyped MLS parcel number). */
function sameHouse(listing, row) {
  const a = addressKey(listing).num;
  const b = (norm(row.PHY_ADDR1).match(/^(\d+)/) || [])[1];
  return listing.AddressHidden || !a || !b || a === b;
}

/** Where the record shows a unit, it agrees with the listing's (an MLS number can belong to another unit). */
function sameUnit(listing, row) {
  const strip = (u) => String(u || "").replace(/^0+/, "");
  const a = strip(addressKey(listing).unit);
  const b = strip(addressKey({ StreetAddress: fullSitus(row) }).unit);
  // Counties sometimes prefix the unit with letters: the listing's "1" is Key West's "R1".
  const prefixed = (x, y) => x.length > y.length && x.endsWith(y) && /^[A-Z]+$/.test(x.slice(0, -y.length));
  return !a || !b || a === b || prefixed(a, b) || prefixed(b, a);
}

/** A parcel known only by its number (the state layer lacks it, e.g. Miami-Dade condo units): links only. */
function idOnlyParcel(listing, id) {
  let pid = cleanParcelId(id);
  // Indian River parcel IDs are 20 digits + ".0"; the MLS sometimes drops the dot.
  if (listing.County === "Indian River" && /^\d{21}$/.test(pid)) pid = `${pid.slice(0, 20)}.${pid.slice(20)}`;
  return { ParcelId: pid, IdOnly: true, Source: "mls", AltKey: null, Links: countyLinks(listing.County, { PARCEL_ID: pid, ALT_KEY: "" }), Shape: null };
}

async function addressMatch(listing, rows) {
  const r = pickParcel(listing, rows);
  return r.status === "no_match" ? pickParcel(listing, await parcelsAt(listing.Longitude, listing.Latitude, { box: true })) : r;
}

/**
 * Full lookup for one listing: match its parcel, fetch the outline, build the Parcel object.
 * With the MLS parcel number (listing.ParcelNumber) the exact parcel, condo unit included, is used;
 * otherwise the parcel is picked by location and address (pickParcel).
 */
export async function lookupParcel(listing, { includeOwner = true } = {}) {
  const want = parcelKey(listing.ParcelNumber);
  const mlsId = want.length >= 8 ? want : "";
  const finish = async (row, matchedBy) => {
    const shape = await parcelShape(row.CO_NO, row.PARCEL_ID).catch(() => null);
    return { status: "matched", parcel: { ...toParcel(listing, row, { shape, includeOwner }), MatchedBy: matchedBy } };
  };
  if (mlsId) {
    // Monroe's MLS numbers are the 14-digit RE number; the state layer prefixes it ("1166 32 00341450000000").
    const isIt = (r) => { const k = parcelKey(r.PARCEL_ID); return k === mlsId || (mlsId.length >= 12 && k.length > mlsId.length && k.endsWith(mlsId)); };
    // By number first: a fraction of a second, where a location search can take 20+ seconds
    // in a large community (one Palm Beach condo point returned 350 parcels).
    let hit = (await parcelsById(listing.ParcelNumber, listing.County).catch(() => [])).find(isIt);
    let rows = null;
    if (!hit) {
      // Some counties store IDs in another format: look at the parcels at the listing's location.
      rows = await parcelsAt(listing.Longitude, listing.Latitude);
      hit = rows.find(isIt);
    }
    if (hit && sameHouse(listing, hit) && sameUnit(listing, hit)) return finish(hit, "mls_parcel");
    if (!hit) {
      // Not in the state layer. A house matched by address is more trustworthy than a number
      // nobody can confirm (it may be mistyped). For a condo unit, the layer often has only the
      // building (all Miami-Dade units), so the MLS number alone gives exact county links.
      const r = await addressMatch(listing, rows);
      if (r.parcel && !addressKey(listing).unit) return finish(r.parcel, "address");
      return { status: "matched", parcel: idOnlyParcel(listing, listing.ParcelNumber) };
    }
    // The MLS number points at a different house or unit: don't trust it, match by address instead.
    const r = await addressMatch(listing, rows || await parcelsAt(listing.Longitude, listing.Latitude));
    if (!r.parcel) return { status: r.status, parcel: null };
    return finish(r.parcel, "address");
  }
  const rows = await parcelsAt(listing.Longitude, listing.Latitude);
  const r = await addressMatch(listing, rows);
  if (!r.parcel) return { status: r.status, parcel: null };
  return finish(r.parcel, "address");
}
