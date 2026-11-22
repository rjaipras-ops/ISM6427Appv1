// Address normalization for matching MLS listings to tax-roll situs addresses.
// Builds on the site's own home key (js/homekey.js): lower case, street types and directions
// abbreviated, "#", "Unit" and "Apt" dropped, ordinals stripped ("10th" -> "10").
//
//   listing "2800 S Ocean Boulevard 8-G", 33480   -> "2800 s ocean blvd 8g 33480"
//   NAL     "2800 S OCEAN BLVD UNIT 8G", "33480"  -> "2800 s ocean blvd 8g 33480"

import { homeKey } from "../../../js/homekey.js";

// Street types and directions after homeKey's normalization. Used to compare the distinctive
// words of two addresses when their street type or direction is written differently.
const STREET_WORDS = new Set([
  "st", "ave", "dr", "rd", "blvd", "ct", "ln", "pl", "ter", "cir", "pkwy", "hwy", "trl", "sq", "cv", "mnr", "xing",
  "pt", "plz", "is", "lndg", "rdg", "way", "wy", "trce", "trace", "loop", "run", "path", "row", "walk", "aly", "pass",
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
]);

/** "8-G" -> "8G", "A-2" -> "A2": unit numbers are written both ways. */
const joinHyphens = (s) => String(s || "").replace(/([A-Za-z0-9])-(?=[A-Za-z0-9])/g, "$1");

/** Strips leading zeros from unit-like tokens ("0204" -> "204"), keeping a lone "0". */
const trimZeros = (t) => t.replace(/^0+(?=\w)/, "");

/** Normalized key "<number> <street words> <unit> <zip>", or null if there is no house number or ZIP. */
export function addressKey(street, zip) {
  const k = homeKey(joinHyphens(street), String(zip || "").slice(0, 5));
  if (!k) return null;
  const words = k.split(" ");
  const z = words.pop();
  return [words[0], ...words.slice(1).map(trimZeros), z].join(" ");
}

/** The house number and ZIP, used to pick candidate parcels quickly. */
export function numZip(street, zip) {
  const k = addressKey(street, zip);
  if (!k) return null;
  const w = k.split(" ");
  return `${w[0]}|${w[w.length - 1]}`;
}

/** Distinctive words (no street type or direction), sorted, for a looser comparison. */
export function coreWords(street, zip) {
  const k = addressKey(street, zip);
  if (!k) return null;
  const w = k.split(" ");
  return [w[0], ...w.slice(1, -1).filter((x) => !STREET_WORDS.has(x)).sort(), w[w.length - 1]].join(" ");
}

/** Listing street address with its unit, if the MLS keeps the unit in a separate field. */
export function listingStreet(l) {
  const s = String(l.address || "").split(",")[0].trim();
  const u = String(l.unit || "").trim();
  if (!u) return s;
  const key = (x) => joinHyphens(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(s).endsWith(key(u)) ? s : `${s} ${u}`;
}

/** Tax-roll situs: PHY_ADDR1 plus PHY_ADDR2 (Broward keeps condo units in PHY_ADDR2). */
export const situsStreet = (r) => `${String(r.PHY_ADDR1 || "").trim()} ${String(r.PHY_ADDR2 || "").trim()}`.trim();
