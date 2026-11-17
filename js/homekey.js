// A stable key for a home, from its street address and ZIP, so tour reviews stay with the house
// across listings (a relisted home gets a new MLS number) and after it leaves the market.
// Shared by the browser (js/store.js, js/app.js) and the server (netlify/lib/reviews.mjs, seo.mjs).
//
//   "1234 SW Main Street #4B, Port St. Lucie, FL 34953"  ->  "1234 sw main st 4b 34953"
//   "1234 SW MAIN ST 4B" + "34953"                       ->  "1234 sw main st 4b 34953"

const SUFFIX = {
  street: "st", avenue: "ave", av: "ave", drive: "dr", road: "rd", boulevard: "blvd", court: "ct", lane: "ln", place: "pl",
  terrace: "ter", terr: "ter", circle: "cir", parkway: "pkwy", highway: "hwy", trail: "trl", square: "sq", cove: "cv",
  manor: "mnr", crossing: "xing", point: "pt", plaza: "plz", isle: "is", island: "is", landing: "lndg", ridge: "rdg",
};
const DIRECTION = { north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw" };
const UNIT_WORDS = new Set(["unit", "apt", "apartment", "ste", "suite", "bldg", "building", "no"]);
const ORDINAL = /^(\d+)(st|nd|rd|th)$/;

/** Normalized key, or null when the address has no house number or no ZIP (not specific enough). */
export function homeKey(address, zip) {
  const text = String(address || "");
  const street = text.split(",")[0];
  const z = String(zip || "").match(/\b(\d{5})\b/)?.[1] || (text.match(/\b(\d{5})(?:-\d{4})?\s*$/) || text.match(/\b(3[2-4]\d{3})\b/) || [])[1];
  const words = street.toLowerCase().replace(/#/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
    .filter((w) => !UNIT_WORDS.has(w))
    .map((w) => SUFFIX[w] || DIRECTION[w] || (ORDINAL.test(w) ? w.replace(ORDINAL, "$1") : w));
  if (!z || !words.length || !/^\d+[a-z]?$/.test(words[0]) || words[0] === "0") return null;
  return `${words.join(" ")} ${z}`;
}

/** URL-safe form of a key, for /reviews/<slug>. */
export const homeSlug = (key) => (key ? key.replace(/\s+/g, "-") : null);

/** The key a review belongs to: saved with the review, or worked out from its address (older reviews). */
export const reviewHomeKey = (r) => r.homeKey || homeKey(r.address, r.postalCode);
