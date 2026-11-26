// Listing outreach: a neutral note to a listing office when the daily record check finds that a
// listing's facts differ from the county tax roll. Used on the private Record checks tab; the owner
// reviews and sends it from their own email app. Only plain listing-vs-record differences are
// included: never sale history, homestead, value, owner details or the private signals.

export const OUTREACH_CHECKS = ["Living area (sq ft)", "Year built", "Lot size (sq ft)", "Property type / use code"];
export const FOLLOW_UP_DAYS = 14;

const WHY = {
  "Living area (sq ft)": "The roll's building area is often “effective” area, which can include part of a garage or porches, so some difference is normal.",
  "Lot size (sq ft)": "Lot figures can differ with rounding or a recent survey.",
  "Year built": "The roll may show the original construction year or a later effective year.",
  "Property type / use code": "The county's use classification may not have caught up with a change.",
};
const LABEL = { "Living area (sq ft)": "Living area", "Lot size (sq ft)": "Lot size", "Year built": "Year built", "Property type / use code": "Property type" };

/** The flags that may go to a listing office. */
export const outreachFlags = (item) => (item?.flags || []).filter((f) => OUTREACH_CHECKS.includes(f.check));

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * { subject, body } for one record-check item.
 * opts: { agent: { name, brokerage, phone }, source: "2026 final tax roll", followUpOf: ISO date of the first email }
 */
export function outreachEmail(item, opts = {}) {
  const flags = outreachFlags(item);
  const where = `${item.street}${item.city ? `, ${item.city}` : ""}`;
  const mls = item.mls ? ` (MLS ${item.mls})` : "";
  const src = `${item.county} County tax roll${opts.source ? ` (Florida Department of Revenue, ${opts.source})` : " (Florida Department of Revenue)"}`;
  const lines = flags.map((f) => `- ${LABEL[f.check] || f.check}: listing shows ${f.listing ?? "—"}; the tax roll shows ${f.record ?? "—"}. ${WHY[f.check] || ""}`.trim());
  const a = opts.agent || {};
  const sign = [a.name, a.brokerage, a.phone].filter(Boolean).join("\n");
  const first = opts.followUpOf
    ? `I'm following up on my note of ${fmtDate(opts.followUpOf)} about your listing at ${where}${mls}. The listing still differs from the ${src} on:`
    : `I came across your listing at ${where}${mls} and compared a few details with the ${src}. In case it's useful, these differ:`;
  return {
    subject: `${opts.followUpOf ? "Following up: " : ""}Listing details vs. county record, ${item.street}${item.mls ? ` (MLS ${item.mls})` : ""}`,
    body: `Hello,\n\n${first}\n\n${lines.join("\n")}\n\nThere may well be a simple explanation, such as an addition, a remodel not yet on the roll, or a different way of measuring. No reply needed; I just wanted to pass it along.\n\nBest regards,\n${sign}`,
  };
}

/** Follow-up state for an item the owner marked "Contacted listing agent". */
export function followUp(item, now = Date.now()) {
  if (item.status !== "contacted_agent" || !item.statusAt) return null;
  const days = Math.floor((now - Date.parse(item.statusAt)) / 864e5);
  const still = outreachFlags(item).length > 0;
  return { days, due: still && days >= FOLLOW_UP_DAYS, resolved: !still };
}
