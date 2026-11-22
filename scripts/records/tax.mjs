// Buyer's first full-year property tax after the post-sale reset, beside the seller's current bill.
//
// Rules (sources in config/exemptions-<year>.json and config/cost-of-sale-<year>.json):
// - After a change of ownership the parcel is assessed at just value on the next January 1
//   (s. 193.155(3)(a) homestead; s. 193.1554(5) non-homestead residential), so the cap is gone.
// - Just value is estimated from the price less the county's DR-493 "eighth criterion"
//   cost-of-sale adjustment (s. 193.011(8)): Palm Beach and Miami-Dade 15%, Broward 10% for 2026.
// - Homestead: first $25,000 off all levies; additional exemption (2026: up to $26,411) off
//   non-school levies only, applied to assessed value above $50,000.
// - Millage is the parcel's own taxing-district rate (NAL TAX_AUTH_CD), school levies on school
//   taxable value, the rest on non-school taxable value.
// Non-ad valorem assessments are not in the tax roll files and are not included.

const round = (n) => Math.round(n);

/** Homestead exemption amounts for a given assessed value: { school, nonSchool }. */
export function homesteadExemptions(assessed, ex) {
  const first = Math.min(ex.homestead.first.amount, assessed);
  const above = ex.homestead.additional.appliesAboveAssessedValue;
  const additional = Math.max(0, Math.min(ex.homestead.additional.amount, assessed - above));
  return { school: first, nonSchool: first + additional };
}

/** Ad valorem bill from taxable values and a { school, nonSchool } millage. */
export const adValorem = (taxableSchool, taxableNonSchool, m) => round((taxableSchool * m.school + taxableNonSchool * m.nonSchool) / 1000);

/**
 * config: { millage, exemptions, costOfSale } (the JSON files). Returns null fields with a reason
 * when something needed is missing, never a guess.
 */
export function buyerTaxEstimate({ price, county, record }, config) {
  const notes = [];
  const mc = config.millage.counties[county];
  const rate = mc?.byTaxAuthCode?.[record.taxAuthCode];
  if (!rate) return { available: false, reason: mc?.status === "not_loaded" ? `${county} millage is not loaded yet.` : `No millage for taxing district ${record.taxAuthCode}.` };
  const adj = config.costOfSale.counties[county]?.adjustmentPct;
  if (adj == null) return { available: false, reason: `No DR-493 adjustment for ${county}.` };
  if (!(price > 0)) return { available: false, reason: "No price." };

  const justValue = round(price * (1 - adj / 100));
  const ex = homesteadExemptions(justValue, config.exemptions);
  const nonHomestead = adValorem(justValue, justValue, rate);
  const homestead = adValorem(Math.max(0, justValue - ex.school), Math.max(0, justValue - ex.nonSchool), rate);
  const seller = record.taxableSchool != null && record.taxableNonSchool != null ? adValorem(record.taxableSchool, record.taxableNonSchool, rate) : null;
  notes.push(`Estimated just value = price less ${adj}% (${county} 2026 DR-493).`);
  notes.push("Ad valorem only; non-ad valorem assessments (e.g. solid waste, fire fees, CDD) are not included.");
  notes.push("Seller's figure uses the current roll's taxable values; municipal-only exemptions are not reflected.");
  return {
    available: true,
    taxYearRates: config.millage.taxYear,
    district: { code: record.taxAuthCode, name: rate.name, school: rate.school, nonSchool: rate.nonSchool, total: rate.total },
    estimatedJustValue: justValue,
    buyer: { nonHomestead, homestead, homesteadExemptions: ex },
    seller: { current: seller, taxableSchool: record.taxableSchool, taxableNonSchool: record.taxableNonSchool, homestead: record.homestead },
    notes,
  };
}
