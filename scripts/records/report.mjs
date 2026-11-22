// Plain-text report for the private review. Contains addresses and private signals, so it is
// printed to a private console or stored privately only, never committed or logged publicly.
// It never contains owner names or mailing addresses.

import { fmtMoney } from "./checks/util.mjs";
import { listingStreet } from "./lib/address.mjs";

const ICON = { flag: "FLAG", ok: "ok  ", info: "info", not_checked: "—   " };

export function formatReport({ source, results }, { title = "Public record check", date = new Date().toISOString().slice(0, 10) } = {}) {
  const out = [];
  const line = (s = "") => out.push(s);
  const checked = results.filter((r) => r.status === "checked");
  const flagged = checked.filter((r) => r.checks.some((c) => c.status === "flag"));
  const closer = checked.filter((r) => r.fraud.closerLook);
  line(`${title} — ${date}`);
  line(`Source: ${source.label}`);
  if (source.salesWindow) line(`Sales covered by the DOR files: ${source.salesWindow}`);
  line(`Listings: ${results.length} · checked: ${checked.length} · with discrepancies: ${flagged.length} · closer look (private): ${closer.length} · not checked (match): ${results.length - checked.length}`);
  line("");
  for (const r of results) {
    const l = r.listing;
    line("=".repeat(96));
    line(`${listingStreet(l)}, ${l.city || ""} ${l.zip}  ·  ${l.type}  ·  ${fmtMoney(l.listPrice)}  ·  MLS ${l.mls || l.id}  ·  listed ${l.listDate || "?"}`);
    line(`https://itoured.com/homes/${encodeURIComponent(l.id)}`);
    const m = r.match;
    if (r.status !== "checked") {
      line(`  MATCH: ${m.method} (confidence ${m.confidence})${m.parcelId ? ` → parcel ${m.parcelId} "${m.situs}"` : ""}. ${m.reason || ""} No checks run.`);
      continue;
    }
    line(`  MATCH: ${m.method} (confidence ${m.confidence}) → parcel ${m.parcelId}, roll situs "${m.situs}"`);
    for (const c of r.checks) {
      line(`  [${ICON[c.status]}] ${c.check.padEnd(26)} listing: ${String(c.listing ?? "—").padEnd(12)} record: ${String(c.record ?? "—")}`);
      if (c.note && c.status !== "ok") line(`         ${c.note}`);
    }
    const t = r.tax;
    if (t?.available) {
      line(`  TAX (ad valorem, ${t.taxYearRates} rates, district ${t.district.code} ${t.district.name}, ${t.district.total} mills):`);
      line(`         seller's current bill (from roll): ${fmtMoney(t.seller.current)}${t.seller.homestead ? " (homesteaded)" : ""}   ·   MLS tax amount: ${l.taxAnnual != null ? fmtMoney(l.taxAnnual) : "—"}`);
      line(`         (roll as of Jan 1, ${t.taxYearRates}; MLS amounts are usually last year's total including non-ad valorem)`);
      line(`         buyer, first full year after reset: ${fmtMoney(t.buyer.homestead)} with homestead · ${fmtMoney(t.buyer.nonHomestead)} without   (est. just value ${fmtMoney(t.estimatedJustValue)})`);
    } else if (t) line(`  TAX: not estimated — ${t.reason}`);
    const f = r.fraud;
    if (f.score > 0) {
      line(`  PRIVATE SIGNALS (score ${f.score}${f.closerLook ? ", CLOSER LOOK" : ""}): ${f.signals.filter((s) => s.points > 0).map((s) => s.note).join(" ")}`);
    }
  }
  line("=".repeat(96));
  return out.join("\n");
}
