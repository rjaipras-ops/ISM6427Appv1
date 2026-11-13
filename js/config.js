// Site / agent settings. Fill these in with your own details.
export const SITE = {
  agentName: "Rajesh Jaiprashad",
  // BeachesMLS rule 20.2.5: the site must clearly identify your brokerage.
  brokerage: "LoKation Real Estate",
  // Leave phone empty to hide it. Tour requests go through the site's contact form (Netlify Forms),
  // which emails you without your address ever appearing on the site; set the address in Netlify.
  phone: "",
  licenseNo: "SL3403530",

  /* ---------------- BeachesMLS IDX ---------------- */
  mls: "BeachesMLS",
  // Official BeachesMLS logo file (required on every IDX listing). Get it from BeachesMLS/RWorld,
  // save it as e.g. assets/beachesmls-logo.png and put the path here. Until then a text mark shows.
  mlsLogo: "assets/beachesmls-logo.jpg",
  // Required IDX disclaimer (BeachesMLS IDX & VOW Rules, Section 20). The year updates automatically.
  mlsDisclaimer: () =>
    `All listings featuring the BMLS logo are provided by BeachesMLS, Inc. This information is not verified for authenticity or accuracy and is not guaranteed. Copyright ©${new Date().getFullYear()} BeachesMLS, Inc.`,
  // Rule 20.3.8 prohibits showing a seller's/occupant's name on IDX listings. Leave false unless
  // BeachesMLS confirms in writing that the county-record owner name may be shown (the server also
  // needs IDX_SHOW_OWNER=true). The county property-appraiser link shows it on the county's site.
  showOwnerOnMlsListings: false,
  // Sellers can ask you to turn off reviews on their listing (NAR IDX/VOW policy).
  // Add the listing's ListingKey or MLS number here to hide reviews for it.
  reviewsDisabled: [],
  // How often the open page checks for a newer feed sync (minutes).
  refreshMinutes: 5,
  // Your free Flexmls "IDX Lite" search link (Flexmls → Menu → Preferences → IDX Manager).
  // Must be https so it can be embedded on an https site.
  idxLiteUrl: "https://link.flexmls.com/1zf04nqdby09,15",

  // Default map view covering Broward, Palm Beach and St. Lucie counties.
  mapCenter: [26.65, -80.2],
  mapZoom: 9,
};
