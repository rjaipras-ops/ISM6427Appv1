// PRIVATE review signals. Never shown publicly. The output names the kind of signal only:
// no owner names, no mailing addresses. Each signal and its weight is set in rules.json (fraud).

import { monthsBetween, fmtMonth } from "./util.mjs";
import { numZip } from "../lib/address.mjs";

const rx = (s) => new RegExp(s, "i");

export function fraudSignals(l, r, rules) {
  const cfg = rules.fraud, on = (k) => cfg.signals[k]?.enabled, pts = (k) => cfg.signals[k]?.points || 0;
  const p = cfg.patterns, o = r.owner || {};
  const signals = [];
  const add = (id, note) => { if (on(id)) signals.push({ id, points: pts(id), note }); };
  const remarks = String(l.remarks || "");
  const ownerName = String(o.name || "").toUpperCase();

  if (rules.useCode.vacantCodes.includes(r.useCode) && l.type !== "Land" && (l.beds > 0 || l.livingArea > 0)) {
    add("vacantLandListedAsHome", "Listed as a home, but the tax roll codes the parcel as vacant land.");
  }
  const dom = o.stateOfDomicile;
  if (dom === "FC") add("ownerAbroad", "Owner's domicile on the tax roll is a foreign country.");
  else if (dom && dom !== "FL") add("ownerOutOfState", "Owner's domicile on the tax roll is outside Florida.");

  const mail = numZip(o.addr1, o.zip), situs = numZip(r.situs.street, r.situs.zip);
  // A PO box or foreign address has no house-number key; fall back to comparing ZIP codes.
  if ((mail && situs && mail !== situs) || (!mail && o.zip && r.situs.zip && o.zip !== r.situs.zip) || (!mail && dom === "FC")) add("absenteeOwner", "Owner's mailing address is not the property.");
  if (!r.homestead) add("noHomestead", "No homestead exemption.");

  const sales = r.sales.filter((s) => s.price >= rules.lastSale.minPrice);
  const after = sales.find((s) => { const m = monthsBetween({ ...s, month: s.month || 12 }, l.listDate); return m != null && m < 0; });
  if (after) add("ownerChangedAfterListing", `A sale was recorded after the listing date (${fmtMonth(after)}).`);
  const recentWindow = cfg.signals.recentOwnerChange?.withinMonthsBeforeListing ?? 3;
  const recent = sales.find((s) => { const m = monthsBetween(s, l.listDate); return m != null && m >= 0 && m <= recentWindow; });
  if (recent) add("recentOwnerChange", `Ownership changed ${fmtMonth(recent)}, shortly before the listing date.`);

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
