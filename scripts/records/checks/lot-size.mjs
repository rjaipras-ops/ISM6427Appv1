import { result, fmtInt, pctDiff } from "./util.mjs";

/** Listing lot size vs LND_SQFOOT (Users Guide field 44; blank for condos, co-ops and HOA property). */
export function lotSize(l, r, rules) {
  const cfg = rules.lotSize;
  const name = "Lot size (sq ft)";
  if (["004", "005"].includes(r.useCode)) return result(name, "not_checked", fmtInt(l.lotSqFt), null, "Condo/co-op unit: the tax roll has no lot size.");
  if (!(l.lotSqFt > 0)) return result(name, "not_checked", null, fmtInt(r.lotSqFt), "Listing has no lot size.");
  if (!(r.lotSqFt > 0)) return result(name, "not_checked", fmtInt(l.lotSqFt), null, "Tax roll has no lot size.");
  const d = pctDiff(l.lotSqFt, r.lotSqFt);
  if (Math.abs(d) > cfg.tolerancePct && Math.abs(l.lotSqFt - r.lotSqFt) >= cfg.minDifferenceSqFt) {
    return result(name, "flag", fmtInt(l.lotSqFt), fmtInt(r.lotSqFt), `Listing is ${Math.abs(d).toFixed(0)}% ${d > 0 ? "larger" : "smaller"} than the tax roll.`);
  }
  return result(name, "ok", fmtInt(l.lotSqFt), fmtInt(r.lotSqFt), `Within tolerance (${d >= 0 ? "+" : ""}${d.toFixed(0)}%).`);
}
