// Turns raw DOR NAL and SDF rows into the record object the checks use.
// Field meanings: Florida DOR "2026 NAL, SDF and NAP Users Guide" (field numbers noted below).
// Owner fields are kept only in memory for the private fraud signals; they are never written
// to the report, to storage or to logs.

export const COUNTY_NO = { "Miami-Dade": "23", Broward: "16", "Palm Beach": "60" };
export const COUNTY_BY_NO = Object.fromEntries(Object.entries(COUNTY_NO).map(([k, v]) => [v, k]));

/** NAL columns read (everything else in the 160-column file is skipped). */
export const NAL_COLUMNS = [
  "CO_NO", "PARCEL_ID", "ASMNT_YR", "DOR_UC", "JV", "AV_SD", "AV_NSD", "TV_SD", "TV_NSD", "JV_HMSTD", "AV_HMSTD",
  "LND_SQFOOT", "EFF_YR_BLT", "ACT_YR_BLT", "TOT_LVG_AREA", "NO_BULDNG", "NO_RES_UNTS",
  "QUAL_CD1", "SALE_PRC1", "SALE_YR1", "SALE_MO1", "QUAL_CD2", "SALE_PRC2", "SALE_YR2", "SALE_MO2",
  "OWN_NAME", "OWN_ADDR1", "OWN_CITY", "OWN_STATE", "OWN_ZIPCD", "OWN_STATE_DOM",
  "TAX_AUTH_CD", "PHY_ADDR1", "PHY_ADDR2", "PHY_CITY", "PHY_ZIPCD", "EXMPT_01", "EXMPT_02",
];
export const SDF_COLUMNS = ["PARCEL_ID", "SALE_YR", "SALE_MO", "SALE_PRC", "QUAL_CD", "VI_CD", "SAL_CHG_CD", "MULTI_PAR_SAL"];

const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
const str = (v) => String(v ?? "").trim();

/** Sale qualification code groups (Users Guide field 55, "Sale Qualification Codes"). */
export function qualification(code) {
  const c = Number(code);
  if (c === 1 || c === 2) return "qualified (arm's length)";
  if (c >= 3 && c <= 6) return "arm's length, excluded from ratio studies";
  if (c >= 11 && c <= 21) return "disqualified (deed type or parties)";
  if (c >= 30 && c <= 43) return "disqualified (documented circumstances)";
  if (c === 98 || c === 99) return "qualification pending";
  return "unknown code";
}

/** Sale change codes (Users Guide field 63 / SDF field 11). */
export const SALE_CHANGE = { 1: "split", 2: "combine", 3: "new construction", 4: "deletion", 5: "disaster", 6: "other", 7: "remodel and renovation", 8: "incomplete new construction" };

const sale = (yr, mo, prc, q, extra = {}) => {
  const year = num(yr), price = num(prc);
  if (!year || !price) return null;
  return { year, month: num(mo), price, qualCode: str(q), ...extra };
};

/** Combines NAL SALE_1/SALE_2 with SDF rows for the same parcel, newest first, without duplicates. */
export function mergeSales(nalRow, sdfRows = []) {
  const all = [
    ...sdfRows.map((s) => sale(s.SALE_YR, s.SALE_MO, s.SALE_PRC, s.QUAL_CD, {
      vacantOrImproved: str(s.VI_CD) || null, changeCode: num(s.SAL_CHG_CD), multiParcel: !!str(s.MULTI_PAR_SAL),
    })),
    sale(nalRow.SALE_YR1, nalRow.SALE_MO1, nalRow.SALE_PRC1, nalRow.QUAL_CD1),
    sale(nalRow.SALE_YR2, nalRow.SALE_MO2, nalRow.SALE_PRC2, nalRow.QUAL_CD2),
  ].filter(Boolean);
  const seen = new Map();
  for (const s of all) {
    const k = `${s.year}-${s.month}-${s.price}`;
    if (!seen.has(k)) seen.set(k, s);
  }
  return [...seen.values()].sort((a, b) => (b.year - a.year) || ((b.month || 0) - (a.month || 0)));
}

/** Record object for one parcel. `sdfRows` are that parcel's rows from the Sales Data File. */
export function toRecord(row, sdfRows = []) {
  return {
    county: COUNTY_BY_NO[str(row.CO_NO)] || null,
    parcelId: str(row.PARCEL_ID),
    rollYear: num(row.ASMNT_YR),
    useCode: str(row.DOR_UC).padStart(3, "0"),
    justValue: num(row.JV),
    assessedSchool: num(row.AV_SD),
    assessedNonSchool: num(row.AV_NSD),
    taxableSchool: num(row.TV_SD),
    taxableNonSchool: num(row.TV_NSD),
    homesteadJustValue: num(row.JV_HMSTD),
    homesteadAssessed: num(row.AV_HMSTD),
    // Field 110: first $25,000 homestead exemption. JV_HMSTD (field 18) is the Save Our Homes portion.
    homestead: (num(row.EXMPT_01) || 0) > 0 || (num(row.JV_HMSTD) || 0) > 0,
    lotSqFt: num(row.LND_SQFOOT),
    yearBuilt: num(row.ACT_YR_BLT),
    effectiveYearBuilt: num(row.EFF_YR_BLT),
    effectiveArea: num(row.TOT_LVG_AREA), // field 50: total EFFECTIVE area, not heated living area
    buildings: num(row.NO_BULDNG),
    units: num(row.NO_RES_UNTS),
    taxAuthCode: str(row.TAX_AUTH_CD),
    situs: { street: `${str(row.PHY_ADDR1)} ${str(row.PHY_ADDR2)}`.trim(), city: str(row.PHY_CITY), zip: str(row.PHY_ZIPCD).slice(0, 5) },
    sales: mergeSales(row, sdfRows),
    // Private: used only for fraud signals, never output.
    owner: {
      name: str(row.OWN_NAME), addr1: str(row.OWN_ADDR1), city: str(row.OWN_CITY), state: str(row.OWN_STATE),
      zip: str(row.OWN_ZIPCD).slice(0, 5), stateOfDomicile: str(row.OWN_STATE_DOM).toUpperCase(),
    },
  };
}
