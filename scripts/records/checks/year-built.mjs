import { result } from "./util.mjs";
import { rebuilt } from "./living-area.mjs";

/** Listing year built vs ACT_YR_BLT (actual year the primary structure was built; Users Guide field 49). */
export function yearBuilt(l, r, rules) {
  const name = "Year built";
  const eff = r.effectiveYearBuilt && r.effectiveYearBuilt !== r.yearBuilt ? ` Effective year built on the roll: ${r.effectiveYearBuilt}.` : "";
  if (!l.yearBuilt) return result(name, "not_checked", null, r.yearBuilt, "Listing has no year built.");
  if (!r.yearBuilt) return result(name, "not_checked", l.yearBuilt, null, "Tax roll has no year built (vacant or not reported).");
  if (rebuilt(l, r, rules)) return result(name, "info", l.yearBuilt, r.yearBuilt, `New construction: the ${r.rollYear} roll still shows the earlier building.`);
  const gap = l.yearBuilt - r.yearBuilt;
  if (Math.abs(gap) > rules.yearBuilt.toleranceYears) {
    return result(name, "flag", l.yearBuilt, r.yearBuilt, `Listing says ${Math.abs(gap)} year(s) ${gap > 0 ? "newer" : "older"} than the tax roll.${eff}`);
  }
  return result(name, "ok", l.yearBuilt, r.yearBuilt, `Matches.${eff}`);
}
