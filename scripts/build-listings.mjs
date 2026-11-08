// Turns the raw Firecrawl pull (data/raw/manifest.json + *.jsonl) into the app's listing file
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

import { readFileSync, writeFileSync } from "node:fs";
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
  APARTMENT: "Multi-Family",
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

// City -> county. Anything not listed falls back to the file's county.
const CITY_COUNTY = {
  Parkland: "Broward", "Coral Springs": "Broward", "Deerfield Beach": "Broward", "Coconut Creek": "Broward",
  "Lighthouse Point": "Broward", "Hillsboro Beach": "Broward", "Pompano Beach": "Broward",
};

// ZIP -> area / neighborhood label shown on cards (falls back to the city).
const AREAS = {
  "33301": "Downtown Fort Lauderdale / Las Olas", "33304": "Victoria Park", "33305": "Coral Ridge",
  "33306": "Coral Ridge Isles", "33308": "Imperial Point / Bay Colony", "33316": "Harbor Beach / Rio Vista",
  "33062": "Pompano Beach (east of US-1)", "33019": "Hollywood Beach", "33009": "Hallandale Beach",
  "33432": "East Boca / Royal Palm Yacht", "33486": "Boca Square / Camino Gardens", "33496": "West Boca (country clubs)",
  "33498": "West Boca", "33428": "West Boca", "33433": "Boca Del Mar", "33480": "Palm Beach Island",
  "33401": "El Cid / Downtown WPB", "33460": "Lake Worth Beach", "33444": "Delray Beach (east)",
  "33445": "Delray Beach", "33446": "West Delray", "33484": "Kings Point / West Delray", "33437": "West Boynton",
  "33436": "Boynton Beach", "33426": "Boynton Beach", "33435": "Boynton Beach (coastal)",
  "33410": "PGA / Palm Beach Gardens", "33418": "Palm Beach Gardens", "33477": "Jupiter Island / Juno",
  "33458": "Jupiter", "33469": "Tequesta", "33414": "Wellington", "33470": "The Acreage / Loxahatchee",
  "34949": "Hutchinson Island", "34952": "PSL East / St. Lucie River", "34953": "PSL Southwest",
  "34983": "PSL North", "34984": "PSL Central", "34986": "St. Lucie West", "34987": "Tradition / Southern Grove",
  "34981": "Fort Pierce South", "34982": "Fort Pierce", "34951": "Lakewood Park", "34947": "Fort Pierce West",
};

// ZIPs with lots of canal / Intracoastal / ocean frontage.
const WATER_ZIPS = new Set(["33301", "33304", "33305", "33306", "33308", "33316", "33062", "33064", "33019", "33009",
  "33432", "33480", "33401", "33460", "33444", "33435", "33410", "33477", "33458", "33469", "33408", "34949", "34952", "34982"]);
// ZIPs with large 55+ / active-adult communities.
const SENIOR_ZIPS = new Set(["33484", "33446", "33437", "33436", "33433", "33496", "33321", "33069", "33319", "33063", "33442", "33066", "34952", "34986"]);
// ZIPs heavy with golf / country-club communities.
const GOLF_ZIPS = new Set(["33496", "33498", "33433", "33446", "33437", "33418", "33410", "33411", "33414", "34986", "34987", "33326", "33071"]);

function enrich(l) {
  const r = rng(l.ListingId);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const isCondo = l.PropertyType === "Condo";
  const coastal = WATER_ZIPS.has(l.PostalCode);
  const isTown = l.PropertyType === "Townhouse";
  const luxury = l.ListPrice > 1_000_000;

  const yearBuilt = l.ListPrice > 1_500_000 && r() < 0.5
    ? 2018 + Math.floor(r() * 8)
    : (l.County === "St. Lucie" ? 1975 : 1950) + Math.floor(r() * (l.County === "St. Lucie" ? 51 : 76));
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
  const waterfront = coastal && r() < (luxury ? 0.6 : 0.22);
  const floodZone = waterfront || (coastal && r() < 0.5) ? pick(["AE", "AE", "VE", "AH"]) : r() < 0.12 ? "AH" : "X";

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
    View: waterfront ? pick(["Intracoastal", "Ocean", "Canal", "Lake"]) : r() < 0.12 ? pick(["Golf course", "Lake", "Preserve"]) : null,
    FireplaceYN: r() < (luxury ? 0.5 : 0.12),
    CentralAir: r() < 0.97,
    GarageSpaces: isCondo ? (r() < 0.6 ? 1 : 0) : isTown ? 1 + Math.floor(r() * 2) : r() < 0.15 ? 0 : 1 + Math.floor(r() * (luxury ? 3 : 2.4)),
    Basement: false, // essentially nonexistent in South Florida
    SeniorCommunityYN: SENIOR_ZIPS.has(l.PostalCode) ? r() < 0.4 : r() < 0.03,
    ImpactWindows: r() < 0.55,
    BoatDock: waterfront && !isCondo && r() < 0.7,
    OceanAccess: waterfront && r() < 0.6,
    GolfCommunity: GOLF_ZIPS.has(l.PostalCode) ? r() < 0.5 : r() < 0.06,
    FloodZone: floodZone,
    Foreclosure: !luxury && r() < 0.04,
    VirtualTour: r() < 0.35,
    GatedCommunity: r() < 0.18,
    SolarPanels: r() < 0.07,
    EVCharging: r() < 0.08,
  };

  const style = pick(isCondo ? ["Contemporary", "High-rise", "Mid-rise"]
    : ["Ranch", "Mediterranean", "Key West", "Contemporary", "Mid-century Modern", "Spanish Revival", "Florida Vernacular", "Coastal"]);

  const highlights = [
    features.PoolPrivateYN && "private pool",
    waterfront && `${(features.View || "water").toLowerCase()} views`,
    features.GarageSpaces >= 2 && `${features.GarageSpaces}-car garage`,
    newConstruction && "brand-new construction",
    yearBuilt < 1950 && "historic character",
    features.GatedCommunity && "gated community",
    lot > 12000 && "an oversized lot",
    features.SolarPanels && "solar panels",
    features.ImpactWindows && "impact windows",
    features.BoatDock && "a private boat dock",
    features.GolfCommunity && "golf community living",
  ].filter(Boolean);

  const description =
    `${style} ${l.PropertyType.toLowerCase()} in ${l.Neighborhood} (${l.County} County) with ${l.BedroomsTotal} bedrooms, ` +
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

const manifest = JSON.parse(readFileSync(join(rawDir, "manifest.json"), "utf8"));
const idx = Object.fromEntries(manifest.columns.map((c, i) => [c, i]));
const CITY_FIX = { "Port Saint Lucie": "Port St. Lucie", "Port St Lucie": "Port St. Lucie", "Pt Saint Lucie": "Port St. Lucie",
  "Lauderdale By The Sea": "Lauderdale-By-The-Sea", Hallandale: "Hallandale Beach" };
const byId = new Map();
for (const [file, fileCounty] of Object.entries(manifest.files)) {
  const lines = readFileSync(join(rawDir, file), "utf8").split("\n").filter((x) => x.trim());
  for (const line of lines) {
    const row = JSON.parse(line);
    const g = (c) => row[idx[c]];
    if (!g("price") || !g("sqft") || !g("listing_office")) continue; // skip incomplete rows
    const addr = parseAddress(g("address"));
    addr.City = CITY_FIX[addr.City] || addr.City;
    addr.UnparsedAddress = `${addr.StreetAddress}, ${addr.City}, ${addr.StateOrProvince} ${addr.PostalCode}`;
    const base = {
      ListingId: g("source_id"),
      ListPrice: g("price"),
      ...addr,
      County: CITY_COUNTY[addr.City] || fileCounty,
      Neighborhood: AREAS[addr.PostalCode] || addr.City,
      BedroomsTotal: g("beds"),
      BathroomsTotalInteger: g("baths"),
      LivingArea: g("sqft"),
      PropertyType: TYPE_MAP[g("home_type")] || "Other",
      Latitude: g("lat"),
      Longitude: g("lng"),
      ListOfficeName: g("listing_office"),
      SourceUrl: `https://www.zillow.com/homedetails/${g("source_id")}_zpid/`,
      SourceRetrieved: manifest.retrieved,
    };
    base.PricePerSqFt = Math.round(base.ListPrice / base.LivingArea);
    byId.set(base.ListingId, { ...base, demo: enrich(base) });
  }
}

const listings = [...byId.values()].sort((a, b) => a.ListPrice - b.ListPrice);
const out = {
  generated: new Date().toISOString(),
  market: "Broward, Palm Beach & St. Lucie counties, FL",
  counties: ["Broward", "Palm Beach", "St. Lucie"],
  note: "Top-level fields come from public listing data pulled via Firecrawl. Fields under `demo` are generated placeholders until an MLS/IDX feed is connected.",
  count: listings.length,
  listings,
};
writeFileSync(join(root, "data", "listings.json"), JSON.stringify(out, null, 1));
console.log(`Wrote ${listings.length} listings to data/listings.json`);
