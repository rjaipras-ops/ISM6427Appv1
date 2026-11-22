import { result, fmtInt, pctDiff } from "./util.mjs";

/**
 * Listing living area vs the roll's TOT_LVG_AREA. That field is the total EFFECTIVE area (base area
 * plus factored garages, porches and similar; DOR Users Guide field 50), so for houses only a
 * listing that claims more than the effective area is flagged. Condos/co-ops are checked both ways.
 */
export function livingArea(l, r, rules) {
  const cfg = rules.livingArea;
  const name = "Living area (sq ft)";
  if (!(l.livingArea > 0)) return result(name, "not_checked", null, fmtInt(r.effectiveArea), "Listing has no living area.");
  if (!(r.effectiveArea > 0)) return result(name, "not_checked", fmtInt(l.livingArea), null, "Tax roll has no building area for this parcel.");
  const d = pctDiff(l.livingArea, r.effectiveArea);
  const twoWay = cfg.twoWayUseCodes.includes(r.useCode);
  const over = d > cfg.tolerancePct;
  const under = twoWay && d < -cfg.tolerancePct;
  const label = twoWay ? "tax-roll unit area" : "tax-roll effective area (includes factored garage, porches)";
  if (over) return result(name, "flag", fmtInt(l.livingArea), fmtInt(r.effectiveArea), `Listing is ${d.toFixed(0)}% larger than the ${label}.`);
  if (under) return result(name, "flag", fmtInt(l.livingArea), fmtInt(r.effectiveArea), `Listing is ${Math.abs(d).toFixed(0)}% smaller than the ${label}.`);
  return result(name, "ok", fmtInt(l.livingArea), fmtInt(r.effectiveArea), `Within tolerance (${d >= 0 ? "+" : ""}${d.toFixed(0)}% vs ${label}).`);
}
