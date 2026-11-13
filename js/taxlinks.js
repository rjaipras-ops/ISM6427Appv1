// Direct links to a parcel's tax bills (amounts due, paid/unpaid history).
//  - Broward and St. Lucie use TaxSys, which opens the exact account from the parcel number.
//  - Palm Beach's tax site (Aumentum) can't be opened to one parcel by URL, so we link to its
//    property-tax search and the page offers the parcel number to paste.
export function taxBillLink(county, parcelId) {
  const id = String(parcelId || "").trim();
  if (county === "Broward") {
    const c = id.replace(/[^0-9A-Za-z]/g, "");
    return c.length === 12
      ? `https://broward.county-taxes.com/public/real_estate/parcels/${c.slice(0, 6)}-${c.slice(6, 8)}-${c.slice(8)}/bills`
      : "https://county-taxes.net/broward/property-tax";
  }
  if (county === "St. Lucie") {
    const d = id.replace(/\D/g, "");
    return d.length === 15
      ? `https://stlucie.county-taxes.com/public/real_estate/parcels/${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7, 11)}-${d.slice(11, 14)}-${d.slice(14)}/bills`
      : "https://county-taxes.net/stlucie/property-tax";
  }
  if (county === "Palm Beach") return "https://pbctax.publicaccessnow.com/PropertyTax.aspx";
  return null;
}
/** Palm Beach PCN with dashes (00-42-46-22-07-014-6310), as shown on its tax bills. */
export function formatPcn(id) {
  const d = String(id || "").replace(/\D/g, "");
  return d.length === 17 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}-${d.slice(10, 13)}-${d.slice(13)}` : String(id || "");
}
