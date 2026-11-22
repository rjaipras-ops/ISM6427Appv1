import { result, fmtMoney } from "./util.mjs";

/**
 * Homestead status and the gap between just (market) value and assessed value. A large gap means
 * the seller's bill is held down by the Save Our Homes or 10% non-homestead cap, which a buyer
 * loses (see tax.mjs). Informational, not a discrepancy.
 */
export function homesteadValue(l, r) {
  const name = "Homestead and value";
  const capped = r.justValue && r.assessedNonSchool != null ? r.justValue - r.assessedNonSchool : null;
  const parts = [`homestead: ${r.homestead ? "yes" : "no"}`, `just value ${fmtMoney(r.justValue)}`, `assessed (non-school) ${fmtMoney(r.assessedNonSchool)}`];
  const note = capped > 0
    ? `Assessment cap keeps ${fmtMoney(capped)} of value off the seller's bill; it resets after a sale.`
    : "No assessment cap benefit on the current roll.";
  const ratio = l.listPrice && r.justValue ? ` List price is ${((l.listPrice / r.justValue) * 100).toFixed(0)}% of just value.` : "";
  return result(name, "info", l.listPrice ? fmtMoney(l.listPrice) : null, parts.join(", "), note + ratio);
}
