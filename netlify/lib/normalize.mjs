// Turns a Spark REST or RESO Web API listing into the shape the front end uses.
//
// IDs: the app routes and keys reviews by `ListingId`. For MLS listings that is set
// to the MLS ListingKey (stable, URL-safe); the human MLS number is `MlsNumber`.
//
// The `demo` object name is kept for compatibility with js/filters.js, which reads
// filterable details from it. For MLS listings it holds real MLS values (Source: "mls").

const PHOTO_SIZES_LARGE = ["Uri1600", "Uri1280", "Uri2048", "Uri1024", "UriLarge"];
const PHOTO_SIZES_MEDIUM = ["Uri800", "Uri640", "Uri1024"];
const PHOTO_SIZES_THUMB = ["Uri300", "UriThumb", "Uri640"];

const first = (o, keys) => keys.map((k) => o?.[k]).find((v) => typeof v === "string" && v);

function isPhoto(m) {
  if (m.MediaCategory && !/photo|image/i.test(m.MediaCategory)) return false;
  const url = m.MediaURL || first(m, PHOTO_SIZES_LARGE) || "";
  return !/\.(pdf|mp4|mov|docx?)($|\?)/i.test(url);
}

/** Normalizes RESO `Media` or Spark `Photos` into [{ url, medium, thumb, caption, order }]. */
export function normalizePhotos(rec) {
  const raw = Array.isArray(rec.Media) ? rec.Media : Array.isArray(rec.Photos) ? rec.Photos : [];
  const photos = raw.filter(isPhoto).map((m, i) => {
    const url = first(m, PHOTO_SIZES_LARGE) || m.MediaURL;
    return {
      url,
      medium: first(m, PHOTO_SIZES_MEDIUM) || m.MediaURL || url,
      thumb: first(m, PHOTO_SIZES_THUMB) || m.MediaURL || url,
      caption: m.Caption || m.ShortDescription || m.LongDescription || "",
      order: Number.isFinite(Number(m.Order)) ? Number(m.Order) : m.Primary ? -1 : i,
      primary: !!m.Primary,
    };
  }).filter((p) => p.url);
  photos.sort((a, b) => (b.primary - a.primary) || (a.order - b.order));
  return photos;
}

const SUBTYPE = [
  [/condo/i, "Condo"],
  [/town/i, "Townhouse"],
  [/villa/i, "Townhouse"],
  [/duplex|triplex|quadruplex|multi/i, "Multi-Family"],
  [/manufactured|mobile/i, "Mobile/Manufactured"],
  [/land|lot/i, "Land"],
  [/single|detached|residential/i, "Single Family"],
];
const mapType = (sub, type) => (SUBTYPE.find(([re]) => re.test(sub || "")) || SUBTYPE.find(([re]) => re.test(type || "")) || [null, "Other"])[1];

const yes = (v) => v === true || v === 1 || /^(y|yes|true)$/i.test(String(v ?? "").trim());
const list = (v) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");
const monthlyFee = (fee, freq) => {
  const f = Number(fee);
  if (!Number.isFinite(f) || f <= 0) return 0;
  if (/annual|year/i.test(freq || "")) return Math.round(f / 12);
  if (/quarter/i.test(freq || "")) return Math.round(f / 3);
  if (/semi/i.test(freq || "")) return Math.round(f / 6);
  return Math.round(f);
};
const daysSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)) : null);
const titleCase = (s) => String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// MLS coordinates are typed in by listing agents and are sometimes wrong (a dropped minus sign
// puts a Florida home in India; swapped lat/long puts it in the ocean). Repair the obvious
// mistakes, and reject anything still outside South Florida.
const SOFLA = { minLat: 24.3, maxLat: 28.5, minLng: -82.0, maxLng: -79.7 };
const inSoFla = (lat, lng) => lat >= SOFLA.minLat && lat <= SOFLA.maxLat && lng >= SOFLA.minLng && lng <= SOFLA.maxLng;
export function fixCoords(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const [a, b] of [[lat, lng], [lat, -lng], [-lat, lng], [-lat, -lng], [lng, lat], [lng, -lat], [-lng, lat], [-lng, -lat]]) {
    if (inSoFla(a, b)) return [a, b];
  }
  return null;
}

// Solar and EV charging have no dedicated BeachesMLS checkbox, so combine the structured fields that
// can mention them with the listing description. Pool "solar heat" is a pool heater, not panels.
const SOLAR_TEXT = /\bsolar\s+(panels?|system|array|power|energy|electric|roof)\b|photovoltaic|\bpv\s+(system|panels?|array)\b|(owned|leased|paid[- ]off)\s+solar|tesla\s+(solar|powerwall)|solar\s+(is\s+)?(owned|paid)/i;
const EV_TEXT = /\bev\s*(charg\w*|ready|outlet|plug)|electric\s+(vehicle|car)\s+charg\w*|\bcar\s+charg(er|ing)\b|tesla\s+(wall\s*)?(charger|connector)|level\s*2\s+charg\w*/i;

/** Full listing (for the detail view). Returns null if the listing may not be displayed. */
export function normalizeListing(rec, { syncedAt } = {}) {
  if (rec.InternetEntireListingDisplayYN === false) return null; // seller opted out of internet display
  const coords = fixCoords(rec.Latitude, rec.Longitude);
  if (!coords) return null; // missing or impossible location: can't map it
  const [lat, lng] = coords;

  const showAddress = rec.InternetAddressDisplayYN !== false;
  const street = rec.UnparsedAddress
    ? String(rec.UnparsedAddress).split(",")[0]
    : [rec.StreetNumber, rec.StreetName, rec.UnitNumber && `#${rec.UnitNumber}`].filter(Boolean).join(" ");
  const city = titleCase(rec.City);
  const county = String(rec.CountyOrParish || "").replace(/\s+county$/i, "");
  const photos = normalizePhotos(rec);
  const price = Number(rec.ListPrice) || 0;
  const living = Number(rec.LivingArea) || 0;
  const original = Number(rec.OriginalListPrice) || price;
  const listed = rec.OnMarketDate || rec.ListingContractDate || null;
  const lot = Number(rec.LotSizeSquareFeet) || (Number(rec.LotSizeAcres) ? Math.round(Number(rec.LotSizeAcres) * 43560) : 0);
  const cooling = list(rec.Cooling);
  const leasing = list(rec.Leasing_sp_Permitted_sp_Details_co_Leasing_sp_Permitted_sp_Details);
  const leaseLimits = list(rec.Other_sp_Leasing_sp_Restrictions_co_Other_sp_Leasing_sp_Restrictions);

  return {
    ListingId: String(rec.ListingKey),
    ListingKey: String(rec.ListingKey),
    MlsNumber: rec.ListingId ? String(rec.ListingId) : null,
    Source: "mls",
    ListPrice: price,
    UnparsedAddress: showAddress ? `${titleCase(street)}, ${city}, ${rec.StateOrProvince || "FL"} ${rec.PostalCode || ""}`.trim() : `Address withheld, ${city}, ${rec.StateOrProvince || "FL"}`,
    StreetAddress: showAddress ? titleCase(street) : "Address withheld",
    AddressHidden: !showAddress,
    UnitNumber: rec.UnitNumber || null,
    City: city,
    StateOrProvince: rec.StateOrProvince || "FL",
    PostalCode: rec.PostalCode ? String(rec.PostalCode).slice(0, 5) : "",
    County: county,
    Neighborhood: titleCase(rec.SubdivisionName) || city,
    BedroomsTotal: Number(rec.BedroomsTotal) || 0,
    BathroomsTotalInteger: Number(rec.BathroomsTotalInteger) || (Number(rec.BathroomsFull) || 0) + (Number(rec.BathroomsHalf) ? 1 : 0),
    LivingArea: living,
    PropertyType: mapType(rec.PropertySubType, rec.PropertyType),
    Latitude: lat,
    Longitude: lng,
    ListOfficeName: rec.ListOfficeName || "",
    ListOfficePhone: rec.ListOfficePhone || "",
    ListOfficeEmail: rec.ListOfficeEmail || "",
    PricePerSqFt: living ? Math.round(price / living) : 0,
    ModificationTimestamp: rec.ModificationTimestamp || null,
    PhotosChangeTimestamp: rec.PhotosChangeTimestamp || null,
    SyncedAt: syncedAt || new Date().toISOString(),
    VirtualTourURL: rec.VirtualTourURLUnbranded || null,
    primaryPhotoUrl: photos[0]?.medium || null,
    photoCount: Math.max(Number(rec.PhotosCount) || 0, photos.length),
    photos,
    demo: {
      StandardStatus: rec.StandardStatus || "Active",
      OriginalListPrice: original,
      PriceReduced: original > price,
      ListingContractDate: listed ? String(listed).slice(0, 10) : null,
      DaysOnMarket: Number.isFinite(Number(rec.DaysOnMarket)) ? Number(rec.DaysOnMarket) : daysSince(listed),
      YearBuilt: Number(rec.YearBuilt) || null,
      NewConstructionYN: yes(rec.NewConstructionYN),
      StoriesTotal: Number(rec.StoriesTotal) || null,
      LotSizeSquareFeet: lot || null,
      AssociationFee: monthlyFee(rec.AssociationFee, rec.AssociationFeeFrequency),
      ArchitecturalStyle: list(rec.ArchitecturalStyle) || null,
      OpenHouse: null,
      TaxAnnualAmount: Number(rec.TaxAnnualAmount) || null,
      PoolPrivateYN: yes(rec.PoolPrivateYN),
      WaterfrontYN: yes(rec.WaterfrontYN),
      View: list(rec.View) || null,
      FireplaceYN: yes(rec.FireplaceYN),
      CentralAir: /central/i.test(cooling),
      GarageSpaces: Number(rec.GarageSpaces) || 0,
      Basement: false,
      SeniorCommunityYN: yes(rec.SeniorCommunityYN) || yes(rec.General_sp_Property_sp_Information_co_Senior_sp_Community_sp_YN),
      Foreclosure: /reo|foreclos|bank owned|auction/i.test(list(rec.SpecialListingConditions)),
      ShortSale: /short sale/i.test(list(rec.SpecialListingConditions)),
      VirtualTour: !!rec.VirtualTourURLUnbranded,
      GatedCommunity: yes(rec.General_sp_Property_sp_Information_co_Gated_sp_Community_sp_YN) || /gated|security gate|guard/i.test(list(rec.SecurityFeatures)),
      SolarPanels: !!list(rec.Power_sp_Production_co_Annual_sp_Status) || SOLAR_TEXT.test(`${list(rec.GreenEnergyEfficient)} ${list(rec.Electric)} ${rec.PublicRemarks || ""}`),
      EVCharging: EV_TEXT.test(`${list(rec.ParkingFeatures)} ${list(rec.Electric)} ${list(rec.GreenEnergyEfficient)} ${rec.PublicRemarks || ""}`),
      ImpactWindows: /complete|partial/i.test(list(rec.Storm_sp_Protection_co_Impact_sp_Glass)) || /impact/i.test(list(rec.Storm_sp_Protection_sp_Details_co_Storm_sp_Protection_sp_Details)),
      BoatDock: /^(yes|available)/i.test(list(rec.Boat_sp_and_sp_Dock_sp_Information_co_Dock)) || /dock/i.test(list(rec.Boat_sp_and_sp_Dock_sp_Features_co_Boat_sp_and_sp_Dock_sp_Features)),
      OceanAccess: /ocean access|ocean front|no fixed bridge|intracoastal/i.test(list(rec.WaterfrontFeatures)),
      GolfCommunity: /golf/i.test(`${list(rec.View)} ${list(rec.LotFeatures)}`),
      // Concrete block / CBS construction (Florida buyers and insurers look for it).
      CBS: /\bcbs\b|block|concrete/i.test(list(rec.ConstructionMaterials)),
      // Short-term rentals allowed (and not separately prohibited).
      ShortTermRental: /short term rentals? allowed/i.test(leasing) && !/short term rentals? prohibited|leasing prohibited$/i.test(leaseLimits),
      FloodZone: null,
      PublicRemarks: rec.PublicRemarks || "",
    },
  };
}

/** Compact version for the map/search index: no remarks, no photo list. */
export function toIndexEntry(listing) {
  const { photos, demo, ...rest } = listing;
  const { PublicRemarks, ...d } = demo;
  return { ...rest, demo: d };
}
