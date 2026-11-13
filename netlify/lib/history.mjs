// Sale history and actual tax bill for a parcel, from the county property appraisers.
//  - Broward: BCPA's public JSON service (last 5 recorded transfers + the parcel's millage rate).
//  - Palm Beach: the PAPA property page (full sales table + actual ad valorem / non-ad valorem taxes).
//  - St. Lucie: its appraiser site doesn't allow automated requests, so nothing is fetched there
//    (the listing page links to the St. Lucie record card instead).
// Owner names are never returned (BeachesMLS IDX rule 20.3.8).

import { getJSON, setJSON } from "./store.mjs";

const TTL = 7 * 864e5;
const money = (s) => { const n = Number(String(s ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : null; };
const isoDate = (mdy) => { const m = String(mdy || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
const clean = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** A recorded transfer counts as a market sale if it has a real price and isn't flagged as a non-sale. */
function sale(date, price, type, verification = "") {
  const p = money(price);
  // No real price (or flagged as a title change) = a transfer, not a sale.
  const nonSale = !p || p <= 100 || /non-?sale|title change/i.test(verification);
  // A priced transfer that isn't a normal open-market sale (family, quit claim, foreclosure deed…).
  const armsLength = !nonSale && !/disqualified|unqualified|quit ?claim|corrective|death|summary order|life estate|tax deed|certificate of title/i.test(`${type} ${verification}`);
  return { date: isoDate(date), price: p, type: clean(type) || null, marketSale: !nonSale, armsLength, note: clean(verification) || null };
}

async function broward(parcelId) {
  const res = await fetch("https://web.bcpa.net/BcpaClient/search.aspx/getParcelInformation", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ folioNumber: parcelId, taxyear: String(new Date().getFullYear()), action: "CURRENT", use: "" }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`BCPA ${res.status}`);
  const d = (await res.json()).d || {};
  const p = (d.parcelInfok__BackingField || [])[0];
  if (!p) return { sales: [], taxes: null, millage: null };
  const sales = [];
  for (let i = 1; i <= 5; i++) {
    if (p[`saleDate${i}`]) sales.push(sale(p[`saleDate${i}`], p[`stampAmount${i}`], p[`deedType${i}`], p[`saleVerification${i}`]));
  }
  const mr = (d.millageRatek__BackingField || [])[0];
  return { sales, taxes: null, millage: mr ? Number(mr.millageRate) || null : null, millageYear: mr?.millageYear || null };
}

async function palmBeach(parcelId) {
  const res = await fetch(`https://pbcpao.gov/Property/Details?parcelId=${encodeURIComponent(parcelId)}`, {
    headers: { Accept: "text/html" }, signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`PAPA ${res.status}`);
  const h = await res.text();
  const sales = [];
  const t = h.match(/<table[^>]*id="salesTable"[^>]*>([\s\S]*?)<\/table>/i);
  if (t) {
    for (const row of t[1].split(/<tr[\s>]/i).slice(1)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
      if (cells.length >= 4 && /\d{2}\/\d{2}\/\d{4}/.test(cells[0])) sales.push(sale(cells[0], cells[1], cells[3])); // cells[4] (owner) is ignored
    }
  }
  // Taxes table: first data column is the latest year.
  let taxes = null;
  const i = h.indexOf("NON AD VALOREM");
  if (i > 0) {
    const tbl = h.slice(h.lastIndexOf("<table", i), h.indexOf("</table>", i));
    const year = Number((tbl.match(/<th[^>]*>\s*(\d{4})\s*<\/th>/) || [])[1]) || null;
    const first = (label) => money((tbl.match(new RegExp(`<td>\\s*${label}\\s*</td>\\s*<td[^>]*>([^<]*)</td>`, "i")) || [])[1]);
    taxes = { year, adValorem: first("AD VALOREM"), nonAdValorem: first("NON AD VALOREM"), total: first("TOTAL TAX") };
    if (taxes.total == null) taxes = null;
  }
  return { sales, taxes, millage: null };
}

/** { sales: [{date, price, type, marketSale}], taxes: {year, adValorem, nonAdValorem, total} | null, millage } */
export async function getHistory(county, parcelId) {
  const id = String(parcelId || "").replace(/[^0-9A-Za-z]/g, "");
  if (!id || !/^[0-9A-Za-z]{8,24}$/.test(id)) return { status: "bad_request" };
  const fetcher = county === "Broward" ? broward : county === "Palm Beach" ? palmBeach : null;
  if (!fetcher) return { status: "unsupported", sales: [], taxes: null };
  const key = `history/${county.replace(/\W/g, "")}/${id}`;
  const cached = await getJSON(key);
  if (cached && Date.now() - Date.parse(cached.at) < TTL) return cached;
  try {
    const r = await fetcher(id);
    const entry = { at: new Date().toISOString(), status: "ok", ...r };
    await setJSON(key, entry);
    return entry;
  } catch (e) {
    if (cached) return cached; // stale is better than nothing
    return { status: "unavailable", sales: [], taxes: null, error: e.message };
  }
}
