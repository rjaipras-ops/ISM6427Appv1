// Property tax estimates for a buyer, from county records (+ the county's actual bill when we have it).
//
// After a sale, Florida resets the assessed value to the county's market ("just") value, so the
// seller's Save Our Homes / homestead savings go away. Appraisers usually set just value around
// 85% of a recent sale price (statutory cost-of-sale adjustment). So the new owner's taxable value
// is estimated as the HIGHER of the county's current market value and 85% of the price.
//
// Fixed charges (non-ad valorem: fire, solid waste, stormwater…) don't change with a sale and
// are added on top when the county reports them.

// Approximate total millage (per $1,000 of taxable value) when the county's exact rate isn't known.
export const MILLAGE = { Broward: { school: 5.6, other: 13.6 }, "Palm Beach": { school: 6.3, other: 12.6 }, "St. Lucie": { school: 6.2, other: 14.0 } };

/**
 * @param l   listing ({ County, ListPrice, demo.TaxAnnualAmount })
 * @param p   parcel from county records ({ JustValue, TaxableValueSchool, TaxableValueNonSchool, Homestead })
 * @param h   optional appraiser history ({ taxes: {year, adValorem, nonAdValorem, total}, millage })
 */
export function taxEstimates(l, p, h) {
  const base = MILLAGE[l.County] || MILLAGE.Broward;
  const schoolShare = base.school / (base.school + base.other);
  // Exact rate: Broward reports it; for Palm Beach derive it from the actual bill.
  let millage = h?.millage || null;
  if (!millage && h?.taxes?.adValorem && p.TaxableValueNonSchool) {
    const derived = (h.taxes.adValorem / p.TaxableValueNonSchool) * 1000;
    if (derived > 10 && derived < 40) millage = derived;
  }
  const m = millage || base.school + base.other;
  const school = m * schoolShare, other = m - school;
  const fixed = h?.taxes?.nonAdValorem || 0;

  // Current owner's bill: the county's actual bill, then the listing's figure, then our estimate.
  let current, currentNote;
  if (h?.taxes?.total) { current = h.taxes.total; currentNote = `${h.taxes.year || ""} county tax bill`.trim(); }
  else if (l.demo?.TaxAnnualAmount) { current = l.demo.TaxAnnualAmount; currentNote = "Annual taxes per the listing"; }
  else { current = Math.round(((p.TaxableValueSchool || 0) * school + (p.TaxableValueNonSchool || 0) * other) / 1000 + fixed); currentNote = "Estimate from county taxable value"; }

  const newTaxable = Math.max(p.JustValue || 0, (l.ListPrice || 0) * 0.85);
  const afterBuy = Math.round((newTaxable * m) / 1000 + fixed);
  // Homestead (primary residence): $25k off all taxes + another $25k off non-school taxes.
  const homesteadSavings = Math.round((25000 * m + 25000 * other) / 1000);
  return {
    current, currentNote, currentHomestead: !!p.Homestead,
    afterBuy, afterBuyHomestead: Math.max(0, afterBuy - homesteadSavings),
    newTaxable, millage: m, exactMillage: !!millage, fixed,
  };
}
