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
  const id = String(p.PARCEL_ID || "").trim();
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
        bill: /^\d{4}-\d{3}-\d{4}-\d{3}-\d$/.test(id)
          ? `https://stlucie.county-taxes.com/public/real_estate/parcels/${id}/bills`
          : "https://county-taxes.net/stlucie/property-tax",
        // St. Lucie record cards are keyed by the county account number (DOR ALT_KEY).
        appraiser: alt && /^\d+$/.test(alt) ? `https://apps.paslc.gov/rerecordcard/${alt}` : "https://apps.paslc.gov/property-search/",
      };
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
    ParcelId: String(p.PARCEL_ID).trim(),
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
    if (w.length >= 3 && /\d/.test(last) && last.length <= 6 && (SUFFIX.has(prev) || DIRS.has(prev))) {
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
      const res = await fetch(PARCEL_LAYER, { method: "POST", body: new URLSearchParams({ ...params, f: "json" }), headers: { "User-Agent": "Toured parcel lookup" } });
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

/** Full lookup for one listing: match its parcel, fetch the outline, build the Parcel object. */
export async function lookupParcel(listing, { includeOwner = true } = {}) {
  let r = pickParcel(listing, await parcelsAt(listing.Longitude, listing.Latitude));
  if (r.status === "no_match") r = pickParcel(listing, await parcelsAt(listing.Longitude, listing.Latitude, { box: true }));
  if (!r.parcel) return { status: r.status, parcel: null };
  const shape = await parcelShape(r.parcel.CO_NO, r.parcel.PARCEL_ID).catch(() => null);
  return { status: "matched", parcel: toParcel(listing, r.parcel, { shape, includeOwner }) };
}
