import { result, fmtMoney, fmtMonth, monthsBetween } from "./util.mjs";
import { qualification, SALE_CHANGE } from "../lib/record.mjs";

/**
 * Last recorded sale from the DOR files. The NAL/SDF only hold sales from the year before the
 * roll's January 1 through the file date (ctx.salesWindow), so "none" means none in that window.
 * Flags a resale: the last sale falls within rules.lastSale.resaleWithinMonths before the listing date.
 */
export function lastSale(l, r, rules, ctx = {}) {
  const name = "Last sale";
  const win = ctx.salesWindow ? ` (DOR sales file covers ${ctx.salesWindow})` : "";
  const sales = r.sales.filter((s) => s.price >= rules.lastSale.minPrice);
  if (!sales.length) return result(name, "info", null, "none", `No sale recorded${win}.`);
  // Sales after the listing date are handled by the private fraud signals, not here.
  const before = sales.filter((s) => { const m = monthsBetween(s, l.listDate); return m == null || m >= 0; });
  const s = before[0] || sales[0];
  const change = s.changeCode ? `, changed after sale: ${SALE_CHANGE[s.changeCode] || s.changeCode}` : "";
  const multi = s.multiParcel ? ", multi-parcel sale" : "";
  const desc = `${fmtMonth(s)}, ${fmtMoney(s.price)} (${qualification(s.qualCode)}${change}${multi})`;
  const months = monthsBetween(s, l.listDate);
  if (months != null && months >= 0 && months <= rules.lastSale.resaleWithinMonths) {
    const gain = l.listPrice && s.price ? ` Listed at ${fmtMoney(l.listPrice)}, ${(((l.listPrice - s.price) / s.price) * 100).toFixed(0)}% above that sale.` : "";
    return result(name, "flag", l.listDate, desc, `Resale: listed about ${months} month(s) after this sale.${gain}`);
  }
  return result(name, "info", l.listDate, desc, months == null ? "Listing date unknown." : `About ${months} month(s) before the listing date.`);
}
