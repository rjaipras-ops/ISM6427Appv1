// Test mode: used only while SPARK_API_BEARER_TOKEN is empty.
// Produces sample listings in the same RESO Web API shape the Spark feed returns,
// built from the demo dataset (data/listings.json). The sample "photos" are real
// images of each property from Esri (satellite close-up, wider satellite, street map),
// so nothing copyrighted by listing photographers is used.
// The UI shows a "Sample data" banner whenever this mode is active.

import demo from "../../data/listings.json" with { type: "json" };

const R = 6378137;
const merc = (lng, lat) => [(R * lng * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
function esriExport(service, lng, lat, widthM, w = 1280, h = 800) {
  const [x, y] = merc(lng, lat);
  const hM = (widthM * h) / w;
  const q = new URLSearchParams({
    bbox: [x - widthM / 2, y - hM / 2, x + widthM / 2, y + hM / 2].map((n) => n.toFixed(2)).join(","),
    bboxSR: "3857", imageSR: "3857", size: `${w},${h}`, format: "jpg", f: "image",
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/export?${q}`;
}

function sampleMedia(l) {
  const shots = [
    // ≥ 0.21 m/px or Esri's export endpoint errors; 1280 px wide → ≥ 270 m.
    ["World_Imagery", 280, "Sample photo (test mode): satellite view of the property"],
    ["World_Imagery", 700, "Sample photo (test mode): satellite view of the neighborhood"],
    ["World_Street_Map", 1500, "Sample photo (test mode): street map"],
  ];
  return shots.map(([svc, width, caption], i) => {
    const big = esriExport(svc, l.Longitude, l.Latitude, width, 1280, 800);
    const mid = esriExport(svc, l.Longitude, l.Latitude, width, 800, 500);
    const small = esriExport(svc, l.Longitude, l.Latitude, width, 400, 250);
    return {
      MediaKey: `MOCK-${l.ListingId}-${i}`, MediaCategory: "Photo", Order: i,
      MediaURL: big, Uri1600: big, Uri800: mid, Uri640: mid, Uri300: small,
      ShortDescription: caption,
    };
  });
}

const SUBTYPE = { "Single Family": "SingleFamilyResidence", Condo: "Condominium", Townhouse: "Townhouse", "Multi-Family": "Duplex", "Mobile/Manufactured": "ManufacturedHome" };

/** Sample listings as RESO Property records (with $expand=Media). */
export function mockRecords() {
  const now = new Date().toISOString();
  return demo.listings.map((l, n) => {
    const d = l.demo;
    return {
      ListingKey: `MOCK${l.ListingId}`,
      ListingId: `SAMPLE-${String(n + 1).padStart(4, "0")}`,
      StandardStatus: d.StandardStatus,
      ListPrice: l.ListPrice,
      OriginalListPrice: d.OriginalListPrice,
      UnparsedAddress: `${l.StreetAddress}, ${l.City}, FL ${l.PostalCode}`,
      City: l.City, StateOrProvince: "FL", PostalCode: l.PostalCode, CountyOrParish: l.County,
      SubdivisionName: l.Neighborhood,
      Latitude: l.Latitude, Longitude: l.Longitude,
      PropertyType: "Residential", PropertySubType: SUBTYPE[l.PropertyType] || "SingleFamilyResidence",
      BedroomsTotal: l.BedroomsTotal, BathroomsTotalInteger: l.BathroomsTotalInteger, LivingArea: l.LivingArea,
      LotSizeSquareFeet: d.LotSizeSquareFeet, YearBuilt: d.YearBuilt, StoriesTotal: d.StoriesTotal, GarageSpaces: d.GarageSpaces,
      AssociationFee: d.AssociationFee, AssociationFeeFrequency: "Monthly", TaxAnnualAmount: d.TaxAnnualAmount,
      PoolPrivateYN: d.PoolPrivateYN, WaterfrontYN: d.WaterfrontYN, View: d.View ? [d.View] : [],
      FireplaceYN: d.FireplaceYN, Cooling: d.CentralAir ? ["Central Air"] : [],
      NewConstructionYN: d.NewConstructionYN, SeniorCommunityYN: d.SeniorCommunityYN,
      ArchitecturalStyle: [d.ArchitecturalStyle],
      PublicRemarks: "Sample listing for testing the MLS integration (test mode). Real MLS remarks, photos and details appear once the BeachesMLS feed key is configured.",
      DaysOnMarket: d.DaysOnMarket, OnMarketDate: d.ListingContractDate,
      ListOfficeName: l.ListOfficeName, ListOfficePhone: "(555) 555-0100", ListOfficeEmail: "",
      ModificationTimestamp: now, PhotosChangeTimestamp: now, PhotosCount: 3,
      InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true,
      Media: sampleMedia(l),
    };
  });
}
