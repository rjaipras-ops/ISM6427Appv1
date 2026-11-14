// Compact, column-based format for the search index, so ~30k listings stay small
// enough to send to the browser (and under Netlify's 6 MB response limit).
// The response carries the field names and flag names; js/store.js rebuilds
// ordinary listing objects from them.

export const INDEX_FIELDS = [
  "ListingId", "MlsNumber", "ListPrice", "StreetAddress", "City", "PostalCode", "County", "Neighborhood",
  "Latitude", "Longitude", "BedroomsTotal", "BathroomsTotalInteger", "LivingArea", "PropertyType",
  "ListOfficeName", "ListOfficePhone", "primaryPhotoUrl", "photoCount", "ModificationTimestamp",
  "demo.StandardStatus", "demo.OriginalListPrice", "demo.DaysOnMarket", "demo.YearBuilt", "demo.LotSizeSquareFeet",
  "demo.AssociationFee", "demo.GarageSpaces", "demo.StoriesTotal", "demo.View", "demo.ArchitecturalStyle",
];

// Boolean fields packed into one integer per listing.
export const INDEX_FLAGS = [
  "AddressHidden", "demo.PriceReduced", "demo.NewConstructionYN", "demo.PoolPrivateYN", "demo.WaterfrontYN",
  "demo.FireplaceYN", "demo.CentralAir", "demo.SeniorCommunityYN", "demo.VirtualTour",
  // Added later: append only. Bumping INDEX_SCHEMA re-pulls every listing so these fill in.
  "demo.GatedCommunity", "demo.ImpactWindows", "demo.BoatDock", "demo.OceanAccess", "demo.GolfCommunity",
  "demo.Foreclosure", "demo.ShortSale", "demo.CBS", "demo.ShortTermRental",
  "demo.SolarPanels", "demo.EVCharging",
];
export const INDEX_SCHEMA = 5; // 5: statewide (all Florida counties) // 4: also builds the description search shards

const get = (o, path) => path.split(".").reduce((v, k) => (v == null ? v : v[k]), o);

export function toRow(listing) {
  const row = INDEX_FIELDS.map((f) => {
    const v = get(listing, f);
    return v === undefined ? null : v;
  });
  let flags = 0;
  INDEX_FLAGS.forEach((f, i) => { if (get(listing, f)) flags |= 1 << i; });
  row.push(flags);
  return row;
}
