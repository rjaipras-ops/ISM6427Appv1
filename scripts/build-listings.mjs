// Turns the raw Firecrawl pull (data/raw/*.json) into the app's listing file
// (data/listings.json), using RESO Data Dictionary field names so a real
// MLS/IDX feed can replace it later without changing the front end.
//
// Real values from the pull: ListingId, ListPrice, address, beds, baths,
// LivingArea, PropertyType, coordinates, ListOfficeName, SourceUrl.
//
// Everything under `demo` is GENERATED (deterministically from the listing id)
// so the Realtor.com-style filters have something to filter on. Replace it with
// the matching RESO fields from your MLS feed. The UI labels these as estimates.
//
// Usage: node scripts/build-listings.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "data", "raw");

// Small seeded PRNG so every build produces the same demo attributes.
function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPE_MAP = {
  SINGLE_FAMILY: "Single Family",
  CONDO: "Condo",
  TOWNHOUSE: "Townhouse",
  MULTI_FAMILY: "Multi-Family",
  MANUFACTURED: "Mobile/Manufactured",
  LOT: "Land",
};

const title = (s) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Fl)\b/, "FL")
    .replace(/\b(Nw|Ne|Sw|Se|N|S|E|W)\b/g, (m) => m.toUpperCase());

function parseAddress(full) {
  // "1911 W BEACH STREET, TAMPA, FL 33607"
  const parts = full.split(",").map((p) => p.trim());
  const [state, zip] = (parts[2] || "").split(/\s+/);
  const street = title(parts[0]);
  const unitMatch = street.match(/\s(#\s?\w+|Unit \w+|Apt \w+|Lot \w+)$/i);
  return {
    UnparsedAddress: `${street}, ${title(parts[1] || "")}, ${state} ${zip}`,
    StreetAddress: street,
    UnitNumber: unitMatch ? unitMatch[1].replace(/^(Unit|Apt|Lot)\s/i, "#") : null,
    City: title(parts[1] || ""),
    StateOrProvince: state,
    PostalCode: zip,
  };
}

const NEIGHBORHOODS = {
  "33602": "Downtown / Channel District", "33603": "Seminole Heights", "33604": "Sulphur Springs",
  "33605": "Ybor City", "33606": "Hyde Park / Davis Islands", "33607": "West Tampa",
  "33609": "SoHo / Palma Ceia", "33610": "East Tampa", "33611": "Ballast Point",
  "33612": "University Area", "33613": "North Tampa", "33615": "Town 'n' Country",
  "33616": "Port Tampa", "33617": "Temple Terrace", "33618": "Carrollwood",
  "33619": "Palm River", "33624": "Northdale", "33625": "Citrus Park", "33626": "Westchase",
  "33629": "Beach Park / Bayshore", "33635": "Countryway", "33637": "Temple Terrace East",
  "33647": "New Tampa", "33549": "Lutz", "33556": "Odessa", "33578": "Riverview",
  "33702": "St. Petersburg North",
};

const WATER_ZIPS = new Set(["33606", "33611", "33629", "33616", "33602", "33556", "33626"]);

function enrich(l) {
  const r = rng(l.ListingId);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const isCondo = l.PropertyType === "Condo";
  const isTown = l.PropertyType === "Townhouse";
  const luxury = l.ListPrice > 1_000_000;

  const yearBuilt = l.ListPrice > 1_500_000 && r() < 0.5
    ? 2018 + Math.floor(r() * 8)
    : 1925 + Math.floor(r() * 100);
  const newConstruction = yearBuilt >= 2025;
  const stories = isCondo ? 1 : l.LivingArea > 2600 ? (r() < 0.75 ? 2 : 1) : r() < 0.25 ? 2 : 1;
  const lot = isCondo ? 0 : isTown ? 1500 + Math.floor(r() * 1500)
    : Math.round((5000 + r() * (luxury ? 20000 : 9000)) / 10) * 10;
  const hoa = isCondo ? 250 + Math.floor(r() * 650) : isTown ? 120 + Math.floor(r() * 280)
    : r() < 0.45 ? 20 + Math.floor(r() * 120) : 0;
  const dom = Math.floor(r() ** 2 * 160);
  const statusRoll = r();
  const status = statusRoll < 0.08 ? "Pending" : statusRoll < 0.15 ? "Active Under Contract" : "Active";
  const reduced = r() < 0.3 && dom > 14;
  const origPrice = reduced ? Math.round((l.ListPrice * (1.03 + r() * 0.07)) / 1000) * 1000 : l.ListPrice;
  const waterfront = WATER_ZIPS.has(l.PostalCode) && r() < (luxury ? 0.55 : 0.18);

  const today = new Date("2026-11-08T12:00:00Z");
  const listed = new Date(today.getTime() - dom * 86400000);
  let openHouse = null;
  if (status === "Active" && r() < 0.28) {
    const d = new Date(today.getTime() + (1 + Math.floor(r() * 7)) * 86400000);
    openHouse = { date: d.toISOString().slice(0, 10), start: pick(["11:00", "12:00", "13:00", "14:00"]), durationHrs: 2 };
  }

  const features = {
    PoolPrivateYN: !isCondo && r() < (luxury ? 0.7 : 0.3),
    WaterfrontYN: waterfront,
    View: waterfront ? pick(["Water", "Bay", "Lake", "Canal"]) : r() < 0.1 ? "City" : null,
    FireplaceYN: r() < (luxury ? 0.5 : 0.12),
    CentralAir: r() < 0.97,
    GarageSpaces: isCondo ? (r() < 0.6 ? 1 : 0) : isTown ? 1 + Math.floor(r() * 2) : r() < 0.15 ? 0 : 1 + Math.floor(r() * (luxury ? 3 : 2.4)),
    Basement: false, // practically nonexistent in Tampa; kept so the filter exists
    SeniorCommunityYN: r() < 0.04,
    Foreclosure: !luxury && r() < 0.04,
    VirtualTour: r() < 0.35,
    GatedCommunity: r() < 0.18,
    SolarPanels: r() < 0.07,
    EVCharging: r() < 0.08,
  };

  const style = pick(isCondo ? ["Contemporary", "High-rise", "Mid-rise"]
    : ["Ranch", "Bungalow", "Mediterranean", "Craftsman", "Contemporary", "Colonial", "Florida Vernacular", "Mid-century"]);

  const highlights = [
    features.PoolPrivateYN && "private pool",
    waterfront && `${(features.View || "water").toLowerCase()} views`,
    features.GarageSpaces >= 2 && `${features.GarageSpaces}-car garage`,
    newConstruction && "brand-new construction",
    yearBuilt < 1950 && "historic character",
    features.GatedCommunity && "gated community",
    lot > 12000 && "an oversized lot",
    features.SolarPanels && "solar panels",
  ].filter(Boolean);

  const description =
    `${style} ${l.PropertyType.toLowerCase()} in ${l.Neighborhood} with ${l.BedroomsTotal} bedrooms, ` +
    `${l.BathroomsTotalInteger} baths and ${l.LivingArea.toLocaleString("en-US")} sq ft` +
    (highlights.length ? `, featuring ${highlights.slice(0, 3).join(", ")}.` : ".") +
    " (Placeholder description — the MLS PublicRemarks field will replace this.)";

  return {
    StandardStatus: status,
    OriginalListPrice: origPrice,
    PriceReduced: reduced,
    ListingContractDate: listed.toISOString().slice(0, 10),
    DaysOnMarket: dom,
    YearBuilt: yearBuilt,
    NewConstructionYN: newConstruction,
    StoriesTotal: stories,
    LotSizeSquareFeet: lot,
    AssociationFee: hoa,
    ArchitecturalStyle: style,
    OpenHouse: openHouse,
    TaxAnnualAmount: Math.round(l.ListPrice * (0.014 + r() * 0.006)),
    ...features,
    PublicRemarks: description,
  };
}

const files = readdirSync(rawDir).filter((f) => f.endsWith(".json")).sort();
const byId = new Map();
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(rawDir, f), "utf8"));
  const idx = Object.fromEntries(raw.columns.map((c, i) => [c, i]));
  for (const row of raw.rows) {
    const g = (c) => row[idx[c]];
    if (!g("price") || !g("sqft") || !g("listing_office")) continue; // skip incomplete rows
    const addr = parseAddress(g("address"));
    const base = {
      ListingId: g("source_id"),
      ListPrice: g("price"),
      ...addr,
      Neighborhood: NEIGHBORHOODS[addr.PostalCode] || addr.City,
      BedroomsTotal: g("beds"),
      BathroomsTotalInteger: g("baths"),
      LivingArea: g("sqft"),
      PropertyType: TYPE_MAP[g("home_type")] || "Other",
      Latitude: g("lat"),
      Longitude: g("lng"),
      ListOfficeName: g("listing_office"),
      SourceUrl: g("source_url"),
      SourceRetrieved: raw.retrieved,
    };
    base.PricePerSqFt = Math.round(base.ListPrice / base.LivingArea);
    byId.set(base.ListingId, { ...base, demo: enrich(base) });
  }
}

const listings = [...byId.values()].sort((a, b) => a.ListPrice - b.ListPrice);
const out = {
  generated: new Date().toISOString(),
  market: "Tampa Bay, FL",
  note: "Top-level fields come from public listing data pulled via Firecrawl. Fields under `demo` are generated placeholders until an MLS/IDX feed is connected.",
  count: listings.length,
  listings,
};
writeFileSync(join(root, "data", "listings.json"), JSON.stringify(out, null, 1));
console.log(`Wrote ${listings.length} listings to data/listings.json`);
