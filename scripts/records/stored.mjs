// The private daily report as stored for the admin page (Netlify Blobs, never public).
// Holds only listings that need a look: a flagged check or a private "closer look" score.
// No owner names or mailing addresses: the record object's owner fields are never copied.

import { listingStreet } from "./lib/address.mjs";

/** One stored item for a checked listing, or null if nothing needs review. */
export function toItem(r) {
  if (r.status !== "checked") return null;
  const flags = r.checks.filter((c) => c.status === "flag").map(({ check, listing, record, note }) => ({ check, listing, record, note }));
  if (!flags.length && !r.fraud.closerLook) return null;
  const l = r.listing, t = r.tax;
  const context = r.checks.filter((c) => c.status === "info" && /^(Last sale|Homestead|Property type)/.test(c.check))
    .map(({ check, record, note }) => ({ check, record, note }));
  return {
    id: l.id, mls: l.mls, county: l.county, street: listingStreet(l), city: l.city, zip: l.zip, type: l.type,
    listPrice: l.listPrice, listDate: l.listDate,
    match: { method: r.match.method, confidence: r.match.confidence, parcelId: r.match.parcelId, situs: r.match.situs },
    flags, context,
    tax: t?.available ? { district: `${t.district.code} ${t.district.name}`, mills: t.district.total, seller: t.seller.current, mlsAmount: l.taxAnnual ?? null,
      buyerHomestead: t.buyer.homestead, buyerNonHomestead: t.buyer.nonHomestead, estJustValue: t.estimatedJustValue } : null,
    private: { score: r.fraud.score, closerLook: r.fraud.closerLook, signals: r.fraud.signals.filter((s) => s.points > 0).map(({ id, points, note }) => ({ id, points, note })) },
  };
}

/** Per-county counts (these, and only these, may appear in public logs). */
export function countySummary(results) {
  const s = { listings: results.length, checked: 0, lowConfidence: 0, unmatched: 0, withFlags: 0, closerLook: 0, byMethod: {}, flagsByCheck: {} };
  for (const r of results) {
    s.byMethod[r.match.method] = (s.byMethod[r.match.method] || 0) + 1;
    if (r.status === "unmatched") { s.unmatched++; continue; }
    if (r.status === "low_confidence") { s.lowConfidence++; continue; }
    s.checked++;
    const f = r.checks.filter((c) => c.status === "flag");
    if (f.length) s.withFlags++;
    for (const c of f) s.flagsByCheck[c.check] = (s.flagsByCheck[c.check] || 0) + 1;
    if (r.fraud.closerLook) s.closerLook++;
  }
  return s;
}
