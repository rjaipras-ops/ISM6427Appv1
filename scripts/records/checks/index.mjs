// Runs every check for one matched listing. Returns { checks, fraud, tax }.
import { livingArea } from "./living-area.mjs";
import { yearBuilt } from "./year-built.mjs";
import { lotSize } from "./lot-size.mjs";
import { useCode } from "./use-code.mjs";
import { lastSale } from "./last-sale.mjs";
import { homesteadValue } from "./homestead-value.mjs";
import { notChecked } from "./not-checked.mjs";
import { fraudSignals } from "./fraud.mjs";
import { buyerTaxEstimate } from "../tax.mjs";

export function runChecks(listing, record, config, ctx = {}) {
  const rules = config.rules;
  const checks = [
    livingArea(listing, record, rules),
    yearBuilt(listing, record, rules),
    lotSize(listing, record, rules),
    useCode(listing, record, rules),
    lastSale(listing, record, rules, ctx),
    homesteadValue(listing, record, rules),
    ...notChecked(listing, record, rules),
  ];
  const tax = buyerTaxEstimate({ price: listing.listPrice, county: listing.county, record }, config);
  return { checks, fraud: fraudSignals(listing, record, rules), tax };
}
