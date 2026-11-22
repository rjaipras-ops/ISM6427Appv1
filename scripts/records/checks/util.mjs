// Shared helpers for the checks. Each check is a pure function:
//   (listing, record, rules, ctx) -> result | result[]
// result: { check, status: "ok" | "flag" | "info" | "not_checked", listing, record, note }
// `listing` and `record` hold display values (numbers or short strings), never owner data.

export const result = (check, status, listing, record, note) => ({ check, status, listing: listing ?? null, record: record ?? null, note });

export const fmtInt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
export const fmtMoney = (n) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
export const pctDiff = (a, b) => (b ? ((a - b) / b) * 100 : null);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtMonth = (s) => (s.month ? `${MONTHS[s.month - 1]} ${s.year}` : String(s.year));

/** Whole months from a sale (year, month) to an ISO date. Null if the listing date is unknown. */
export function monthsBetween(sale, isoDate) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return (Number(m[1]) - sale.year) * 12 + (Number(m[2]) - (sale.month || 6));
}

/** Built on or after the roll's January 1 (give or take rules.useCode.newConstructionYears): the roll still shows the lot. */
export const isNewConstruction = (l, r, rules) => !!(l.yearBuilt && r.rollYear && l.yearBuilt >= r.rollYear - (rules.useCode.newConstructionYears ?? 1));
