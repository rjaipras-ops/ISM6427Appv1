// Approximate monthly cost of owning a home, used by the listing calculator and the
// "Max monthly payment" filter so both agree.
//
// South Florida assumptions (approximate, for comparison only):
//  - Property tax: the listing's figure when shown on the detail page; otherwise ~1.9% of price a
//    year, which is closer to what a new (non-homestead) buyer pays after the reassessment.
//  - Homeowners/wind insurance: ~1.4% of price a year, ~1.1% with impact windows.
//  - Flood insurance: only added when the listing says it's in a flood zone other than X.
export const PAY_DEFAULTS = { down: 20, rate: 6.4, years: 30 };
const TAX_RATE = 0.019;

export function monthlyCost(l, opts = {}) {
  const { down, rate, years } = { ...PAY_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v != null)) };
  const d = l.demo || {};
  const price = Number(l.ListPrice) || 0;
  const loan = price * (1 - down / 100);
  const r = rate / 100 / 12, n = years * 12;
  const pi = loan <= 0 ? 0 : r ? (loan * r) / (1 - (1 + r) ** -n) : loan / n;
  const tax = (opts.useListingTax && d.TaxAnnualAmount ? d.TaxAnnualAmount : price * TAX_RATE) / 12;
  const ins = (price * (d.ImpactWindows ? 0.011 : 0.014)) / 12;
  const flood = d.FloodZone && d.FloodZone !== "X" ? (price * 0.003) / 12 : 0;
  const hoa = Number(d.AssociationFee) || 0;
  return { pi, tax, ins, flood, hoa, total: pi + tax + ins + flood + hoa };
}

/** "450k", "$1.2M", "450,000" → 450000; "" → null. */
export function parseMoney(v) {
  const s = String(v ?? "").trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}
