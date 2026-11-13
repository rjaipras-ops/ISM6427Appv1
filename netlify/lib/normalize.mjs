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

const yes = (v) => v === true || v === "Y" || v === "true" || v === 1;
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

/** Full listing (for the detail view). Returns null if the listing may not be displayed. */
export function normalizeListing(rec, { syncedAt } = {}) {
  if (rec.InternetEntireListingDisplayYN === false) return null; // seller opted out of internet display
  const lat = Number(rec.Latitude), lng = Number(rec.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null; // can't map it

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
      SeniorCommunityYN: yes(rec.SeniorCommunityYN),
      Foreclosure: false,
      VirtualTour: !!rec.VirtualTourURLUnbranded,
      GatedCommunity: false,
      SolarPanels: false,
      EVCharging: false,
      ImpactWindows: false,
      BoatDock: false,
      OceanAccess: false,
      GolfCommunity: false,
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
