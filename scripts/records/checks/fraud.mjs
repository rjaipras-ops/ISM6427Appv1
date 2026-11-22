// PRIVATE review signals. Never shown publicly. The output names the kind of signal only:
// no owner names, no mailing addresses. Each signal and its weight is set in rules.json (fraud).

import { monthsBetween, fmtMonth, isNewConstruction } from "./util.mjs";
import { numZip } from "../lib/address.mjs";
import { qualification } from "../lib/record.mjs";

const rx = (s) => new RegExp(s, "i");

export function fraudSignals(l, r, rules) {
  const cfg = rules.fraud, on = (k) => cfg.signals[k]?.enabled, pts = (k) => cfg.signals[k]?.points || 0;
  const p = cfg.patterns, o = r.owner || {};
  const signals = [];
  const add = (id, note, points = pts(id)) => { if (on(id)) signals.push({ id, points, note }); };
  const remarks = String(l.remarks || "");
  const ownerName = String(o.name || "").toUpperCase();

  if (rules.useCode.vacantCodes.includes(r.useCode) && l.type !== "Land" && (l.beds > 0 || l.livingArea > 0) && !isNewConstruction(l, r, rules)) {
    add("vacantLandListedAsHome", "Listed as a home, but the tax roll codes the parcel as vacant land.");
  }
  const dom = o.stateOfDomicile;
  if (dom === "FC") add("ownerAbroad", "Owner's domicile on the tax roll is a foreign country.");
  else if (dom && dom !== "FL") add("ownerOutOfState", "Owner's domicile on the tax roll is outside Florida.");

  const mail = numZip(o.addr1, o.zip), situs = numZip(r.situs.street, r.situs.zip);
  // A PO box or foreign address has no house-number key; fall back to comparing ZIP codes.
  if ((mail && situs && mail !== situs) || (!mail && o.zip && r.situs.zip && o.zip !== r.situs.zip) || (!mail && dom === "FC")) add("absenteeOwner", "Owner's mailing address is not the property.");
  if (!r.homestead) add("noHomestead", "No homestead exemption.");

  // Every recorded transfer counts here, including $10 and $100 deeds.
  const sales = r.sales;
  const after = sales.find((s) => { const m = monthsBetween({ ...s, month: s.month || 12 }, l.listDate); return m != null && m < 0; });
  if (after) add("ownerChangedAfterListing", `A sale was recorded after the listing date (${fmtMonth(after)}).`);
  const recentWindow = cfg.signals.recentOwnerChange?.withinMonthsBeforeListing ?? 3;
  const recent = sales.find((s) => { const m = monthsBetween(s, l.listDate); return m != null && m >= 0 && m <= recentWindow; });
  if (recent) {
    const armsLength = Number(recent.qualCode) >= 1 && Number(recent.qualCode) <= 6;
    const rc = cfg.signals.recentOwnerChange || {};
    add("recentOwnerChange", armsLength
      ? `Bought ${fmtMonth(recent)} in an arm's-length sale, shortly before the listing date.`
      : `Ownership changed ${fmtMonth(recent)} by a non-market transfer (DOR code ${recent.qualCode || "?"}: ${qualification(recent.qualCode)}), shortly before the listing date.`,
    armsLength ? (rc.pointsIfArmsLength ?? 0) : (rc.pointsByQualCode?.[recent.qualCode] ?? pts("recentOwnerChange")));
  }

  if (ownerName && (rx(p.government).test(ownerName) || rx(p.utility).test(ownerName) || rx(p.hoa).test(ownerName))) {
    add("governmentUtilityOrHoaOwner", "Owner on the tax roll is a government body, utility or association.");
  }
  if (ownerName && rx(p.estate).test(ownerName) && !rx(p.estateRemarks).test(remarks)) {
    add("estateOwnerNotDisclosed", "Owner is an estate, but the remarks don't mention an estate sale or probate.");
  }
  if (ownerName && rx(p.entity).test(ownerName) && rx(p.ownerOccupiedRemarks).test(remarks)) {
    add("entityOwnerButOwnerOccupiedRemarks", "Owner is a company or trust, but the remarks describe an owner-occupant.");
  }
  const below = cfg.signals.listPriceFarBelowJustValue?.belowPct ?? 40;
  if (l.listPrice && r.justValue && l.listPrice < r.justValue * (1 - below / 100)) {
    add("listPriceFarBelowJustValue", `List price is more than ${below}% below the county's just value.`);
  }

  const score = signals.reduce((a, s) => a + s.points, 0);
  return { score, closerLook: score >= cfg.closerLookScore, signals };
}
