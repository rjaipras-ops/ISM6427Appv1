import { result, isNewConstruction } from "./util.mjs";

// DOR land use codes (2026 Users Guide, field 8), residential and the vacant/agricultural ones that
// matter for home listings.
export const USE_NAMES = {
  "000": "Vacant residential", "001": "Single family", "002": "Mobile home", "003": "Multi-family, 10+ units",
  "004": "Condominium", "005": "Cooperative", "006": "Retirement home", "007": "Miscellaneous residential",
  "008": "Multi-family, fewer than 10 units", "009": "Residential common elements/areas", "010": "Vacant commercial",
  "040": "Vacant industrial", "070": "Vacant institutional", "099": "Acreage not zoned agricultural",
};
export const useName = (code) => USE_NAMES[code] || `DOR use code ${code}`;

/** Listing property type vs the roll's DOR use code. */
export function useCode(l, r, rules) {
  const name = "Property type / use code";
  const allowed = rules.useCode.allowed[l.type];
  const rec = `${r.useCode} ${useName(r.useCode)}`;
  if (!allowed) return result(name, "not_checked", l.type, rec, "No rule for this listing type.");
  if (allowed.includes(r.useCode)) return result(name, "ok", l.type, rec, "Consistent.");
  const vacant = rules.useCode.vacantCodes.includes(r.useCode);
  if (vacant && isNewConstruction(l, r, rules)) return result(name, "info", l.type, rec, `New construction (built ${l.yearBuilt}): the ${r.rollYear} roll still shows the lot.`);
  if (l.type === "Land" && !vacant) return result(name, "info", l.type, rec, "Listed as land on a parcel with a building: usually a teardown or a lot sold for its land value.");
  return result(name, "flag", l.type, rec, `A ${l.type} listing on a parcel coded "${useName(r.useCode)}".`);
}
