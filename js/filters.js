// Search filter model (Realtor.com-style), matching, sorting and URL sync.

export const PRICE_STEPS = [0, 100e3, 150e3, 200e3, 250e3, 300e3, 350e3, 400e3, 450e3, 500e3, 600e3, 700e3, 800e3, 900e3, 1e6, 1.25e6, 1.5e6, 2e6, 3e6, 5e6, 10e6];
export const SQFT_STEPS = [0, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 5000, 7500];
export const LOT_STEPS = [0, 2000, 4500, 6500, 8000, 10890, 21780, 43560, 87120];
export const LOT_LABELS = { 2000: "2,000 sqft", 4500: "4,500 sqft", 6500: "6,500 sqft", 8000: "8,000 sqft", 10890: "¼ acre", 21780: "½ acre", 43560: "1 acre", 87120: "2 acres" };

export const HOME_TYPES = ["Single Family", "Condo", "Townhouse", "Multi-Family", "Mobile/Manufactured", "Land"];

export const SEGMENTS = {
  bedsMin: [["", "Any"], ["1", "1+"], ["2", "2+"], ["3", "3+"], ["4", "4+"], ["5", "5+"]],
  bathsMin: [["", "Any"], ["1", "1+"], ["2", "2+"], ["3", "3+"], ["4", "4+"]],
  domMax: [["", "Any"], ["1", "New (24h)"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"]],
  stories: [["", "Any"], ["single", "Single story"], ["multi", "Multi-story"]],
  garageMin: [["", "Any"], ["1", "1+"], ["2", "2+"], ["3", "3+"]],
};

const BOOL_KEYS = [
  "statusActive", "statusContingent", "statusPending", "reviewedOnly",
  "openHouse", "priceReduced", "newConstruction", "foreclosure", "virtualTour", "hideSenior",
  "pool", "waterfront", "view", "fireplace", "centralAir", "basement", "gated", "solar", "ev",
];
const NUM_KEYS = ["priceMin", "priceMax", "bedsMin", "bathsMin", "sqftMin", "sqftMax", "lotMin", "lotMax", "yearMin", "yearMax", "hoaMax", "domMax", "garageMin", "minRating"];

export function defaults() {
  return {
    q: "", keyword: "", sort: "relevant", types: [], stories: "",
    priceMin: null, priceMax: null, bedsMin: null, bathsMin: null,
    sqftMin: null, sqftMax: null, lotMin: null, lotMax: null, yearMin: null, yearMax: null,
    hoaMax: null, domMax: null, garageMin: null, minRating: null,
    statusActive: true, statusContingent: true, statusPending: false,
    reviewedOnly: false, openHouse: false, priceReduced: false, newConstruction: false,
    foreclosure: false, virtualTour: false, hideSenior: false,
    pool: false, waterfront: false, view: false, fireplace: false, centralAir: false,
    basement: false, gated: false, solar: false, ev: false,
    bounds: null,
  };
}

// Keys that live in the "More filters" drawer (for its count badge).
export const DRAWER_KEYS = [
  "sqftMin", "sqftMax", "lotMin", "lotMax", "yearMin", "yearMax", "hoaMax", "domMax", "stories", "garageMin",
  "openHouse", "priceReduced", "newConstruction", "foreclosure", "virtualTour", "hideSenior",
  "pool", "waterfront", "view", "fireplace", "centralAir", "basement", "gated", "solar", "ev", "minRating", "keyword",
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function matches(l, f, summary) {
  const d = l.demo;
  const status = d.StandardStatus;
  if (status === "Active" && !f.statusActive) return false;
  if (status === "Active Under Contract" && !f.statusContingent) return false;
  if (status === "Pending" && !f.statusPending) return false;

  if (f.q) {
    const hay = norm(`${l.UnparsedAddress} ${l.Neighborhood} ${l.PostalCode}`);
    if (!norm(f.q).split(" ").every((t) => hay.includes(t))) return false;
  }
  if (f.priceMin != null && l.ListPrice < f.priceMin) return false;
  if (f.priceMax != null && l.ListPrice > f.priceMax) return false;
  if (f.bedsMin != null && l.BedroomsTotal < f.bedsMin) return false;
  if (f.bathsMin != null && l.BathroomsTotalInteger < f.bathsMin) return false;
  if (f.types.length && !f.types.includes(l.PropertyType)) return false;
  if (f.sqftMin != null && l.LivingArea < f.sqftMin) return false;
  if (f.sqftMax != null && l.LivingArea > f.sqftMax) return false;
  if (f.lotMin != null && d.LotSizeSquareFeet < f.lotMin) return false;
  if (f.lotMax != null && d.LotSizeSquareFeet > f.lotMax) return false;
  if (f.yearMin != null && d.YearBuilt < f.yearMin) return false;
  if (f.yearMax != null && d.YearBuilt > f.yearMax) return false;
  if (f.hoaMax != null && d.AssociationFee > f.hoaMax) return false;
  if (f.domMax != null && d.DaysOnMarket > f.domMax) return false;
  if (f.stories === "single" && d.StoriesTotal !== 1) return false;
  if (f.stories === "multi" && d.StoriesTotal < 2) return false;
  if (f.garageMin != null && d.GarageSpaces < f.garageMin) return false;

  if (f.openHouse && !d.OpenHouse) return false;
  if (f.priceReduced && !d.PriceReduced) return false;
  if (f.newConstruction && !d.NewConstructionYN) return false;
  if (f.foreclosure && !d.Foreclosure) return false;
  if (f.virtualTour && !d.VirtualTour) return false;
  if (f.hideSenior && d.SeniorCommunityYN) return false;

  if (f.pool && !d.PoolPrivateYN) return false;
  if (f.waterfront && !d.WaterfrontYN) return false;
  if (f.view && !d.View) return false;
  if (f.fireplace && !d.FireplaceYN) return false;
  if (f.centralAir && !d.CentralAir) return false;
  if (f.basement && !d.Basement) return false;
  if (f.gated && !d.GatedCommunity) return false;
  if (f.solar && !d.SolarPanels) return false;
  if (f.ev && !d.EVCharging) return false;

  if (f.reviewedOnly && !summary) return false;
  if (f.minRating != null && (!summary || summary.avg < f.minRating)) return false;

  if (f.keyword) {
    const hay = norm(`${l.UnparsedAddress} ${l.Neighborhood} ${l.PropertyType} ${d.ArchitecturalStyle} ${d.PublicRemarks} ${d.View || ""}`);
    if (!norm(f.keyword).split(" ").every((t) => hay.includes(t))) return false;
  }
  if (f.bounds) {
    const [s, w, n, e] = f.bounds;
    if (l.Latitude < s || l.Latitude > n || l.Longitude < w || l.Longitude > e) return false;
  }
  return true;
}

export function sortListings(rows, sort, summaries) {
  const r = [...rows];
  const rating = (l) => summaries[l.ListingId]?.avg ?? -1;
  const count = (l) => summaries[l.ListingId]?.count ?? 0;
  switch (sort) {
    case "newest": return r.sort((a, b) => a.demo.DaysOnMarket - b.demo.DaysOnMarket);
    case "priceAsc": return r.sort((a, b) => a.ListPrice - b.ListPrice);
    case "priceDesc": return r.sort((a, b) => b.ListPrice - a.ListPrice);
    case "ppsf": return r.sort((a, b) => a.PricePerSqFt - b.PricePerSqFt);
    case "sqft": return r.sort((a, b) => b.LivingArea - a.LivingArea);
    case "lot": return r.sort((a, b) => b.demo.LotSizeSquareFeet - a.demo.LotSizeSquareFeet);
    case "rating": return r.sort((a, b) => rating(b) - rating(a) || count(b) - count(a));
    case "reviews": return r.sort((a, b) => count(b) - count(a) || rating(b) - rating(a));
    default:
      // Recommended: reviewed homes and fresh listings first, then price.
      return r.sort((a, b) =>
        (count(b) > 0) - (count(a) > 0) ||
        (a.demo.DaysOnMarket > 30) - (b.demo.DaysOnMarket > 30) ||
        a.ListPrice - b.ListPrice);
  }
}

/* ---------- URL <-> state ---------- */
export function toQuery(f) {
  const d = defaults();
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (k === "bounds") continue;
    if (k === "types") { if (v.length) p.set("types", v.join("|")); continue; }
    if (v === d[k] || v === "" || v == null) continue;
    p.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  return p.toString();
}

export function fromQuery(qs) {
  const f = defaults();
  const p = new URLSearchParams(qs);
  for (const [k, v] of p) {
    if (k === "types") f.types = v.split("|").filter((t) => HOME_TYPES.includes(t));
    else if (BOOL_KEYS.includes(k)) f[k] = v === "1";
    else if (NUM_KEYS.includes(k)) { const n = Number(v); if (Number.isFinite(n)) f[k] = n; }
    else if (k in f) f[k] = v;
  }
  return f;
}

/* ---------- Chips ---------- */
const money = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, "")}M` : `$${Math.round(n / 1e3)}K`;
export const shortMoney = money;

export function chipsFor(f) {
  const c = [];
  const add = (label, clear) => c.push({ label, clear });
  if (f.q) add(`“${f.q}”`, { q: "" });
  if (f.priceMin != null || f.priceMax != null)
    add(`${f.priceMin != null ? money(f.priceMin) : "Any"} – ${f.priceMax != null ? money(f.priceMax) : "Any"}`, { priceMin: null, priceMax: null });
  if (f.bedsMin != null) add(`${f.bedsMin}+ beds`, { bedsMin: null });
  if (f.bathsMin != null) add(`${f.bathsMin}+ baths`, { bathsMin: null });
  for (const t of f.types) add(t, { types: f.types.filter((x) => x !== t) });
  if (f.statusPending) add("Incl. pending", { statusPending: false });
  if (!f.statusContingent) add("No contingent", { statusContingent: true });
  if (!f.statusActive) add("No active", { statusActive: true });
  if (f.sqftMin != null || f.sqftMax != null)
    add(`${f.sqftMin ?? "Any"}–${f.sqftMax ?? "Any"} sqft`, { sqftMin: null, sqftMax: null });
  if (f.lotMin != null || f.lotMax != null)
    add(`Lot ${LOT_LABELS[f.lotMin] ?? "Any"}–${LOT_LABELS[f.lotMax] ?? "Any"}`, { lotMin: null, lotMax: null });
  if (f.yearMin != null || f.yearMax != null) add(`Built ${f.yearMin ?? "…"}–${f.yearMax ?? "…"}`, { yearMin: null, yearMax: null });
  if (f.hoaMax != null) add(f.hoaMax === 0 ? "No HOA" : `HOA ≤ $${f.hoaMax}`, { hoaMax: null });
  if (f.domMax != null) add(f.domMax === 1 ? "New listings" : `≤ ${f.domMax} days listed`, { domMax: null });
  if (f.stories) add(f.stories === "single" ? "Single story" : "Multi-story", { stories: "" });
  if (f.garageMin != null) add(`${f.garageMin}+ garage`, { garageMin: null });
  const flags = {
    openHouse: "Open house", priceReduced: "Price reduced", newConstruction: "New construction",
    foreclosure: "Foreclosure", virtualTour: "Virtual tour", hideSenior: "No 55+",
    pool: "Pool", waterfront: "Waterfront", view: "View", fireplace: "Fireplace", centralAir: "Central air",
    basement: "Basement", gated: "Gated", solar: "Solar", ev: "EV charging", reviewedOnly: "Has tour reviews",
  };
  for (const [k, label] of Object.entries(flags)) if (f[k]) add(label, { [k]: false });
  if (f.minRating != null) add(`${f.minRating}+ ★ tours`, { minRating: null });
  if (f.keyword) add(`Keyword: ${f.keyword}`, { keyword: "" });
  if (f.bounds) add("Map area", { bounds: null });
  return c;
}
