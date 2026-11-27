// Lot sizes that can't be right. Listing agents sometimes type square feet into the MLS "acres"
// field (43,560 sq ft = 1 acre, so a 1-acre lot shows as "43,560 acres"). Nov 2026: 113 active
// listings were 20+ acres at under $1,000 an acre, which doesn't happen in South Florida.
//
// Such a lot size is not shown (cards, listing pages, search-engine pages), doesn't count in lot-size
// filters, and sorts last. The listed figure is kept as LotSizeListedAcres so the listing page can say
// why. The MLS value is never converted or replaced; the county record on the listing page gives the
// real size.

export const SQFT_PER_ACRE = 43560;
const MIN_ACRES = 20;
const MIN_PRICE_PER_ACRE = 1000;

/** True when a lot of `sqft` square feet can't be right at `price`. */
export function lotSizeSuspect(sqft, price) {
  const acres = Number(sqft) / SQFT_PER_ACRE;
  return Number(price) > 0 && acres >= MIN_ACRES && Number(price) / acres < MIN_PRICE_PER_ACRE;
}

/** Hides an impossible lot size on a listing ({ ListPrice, demo: { LotSizeSquareFeet } }). Idempotent. */
export function checkLot(l) {
  const d = l?.demo;
  if (!d || d.LotSizeListedAcres != null) return l;
  if (lotSizeSuspect(d.LotSizeSquareFeet, l.ListPrice)) {
    d.LotSizeListedAcres = Math.round((Number(d.LotSizeSquareFeet) / SQFT_PER_ACRE) * 100) / 100;
    d.LotSizeSquareFeet = null;
  }
  return l;
}
