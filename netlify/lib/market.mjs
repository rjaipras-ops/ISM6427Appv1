// Weekly market report drafts for the owner (admin "Market report" tab). Two sources, kept apart:
//
//  1. Closed sales from Florida DOR tax roll files (public records; built by the daily record check,
//     stored as market/sales). Publishable with the source and date.
//  2. Active listings from the BeachesMLS feed (this site's search index). PRIVATE: BeachesMLS hasn't
//     confirmed that aggregate statistics from IDX data may be published (open question 8 in
//     knowledge/idx-compliance-expert/open-questions.md), so the draft marks that part "not for
//     publishing" and the publishable copy leaves it out.
//
// Drafts are templates, not AI, in English and Spanish. Nothing is published from here: the owner
// edits, approves and copies a draft. Wording rule: numbers about homes only, never about who lives
// in an area (fair housing).
//
// Keys: market/sales, market/mls/<week>, market/report/<week> ({ status, en, es, at }: publishable text only), market/weeks

import { readIndex, getJSON, setJSON } from "./store.mjs";
import { INDEX_FIELDS, INDEX_FLAGS } from "./index-format.mjs";

export const DEFAULT_COUNTIES = ["Palm Beach", "Broward", "Miami-Dade", "Martin", "St. Lucie"];
const counties = () => (process.env.MARKET_COUNTIES || "").split(",").map((s) => s.trim()).filter(Boolean).length
  ? process.env.MARKET_COUNTIES.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_COUNTIES;

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Monday of the week (America/New_York) as YYYY-MM-DD. */
export function weekOf(d = new Date()) {
  const ny = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d) + "T12:00:00Z");
  ny.setUTCDate(ny.getUTCDate() - ((ny.getUTCDay() + 6) % 7));
  return ny.toISOString().slice(0, 10);
}

const GROUP = { "Single Family": "single-family", Condo: "condo", Townhouse: "condo" };

/** Active-listing statistics by county and group from index rows ({ key: row }). */
export function mlsStats(index, wanted = counties()) {
  const col = Object.fromEntries(INDEX_FIELDS.map((f, i) => [f, i]));
  const flagBit = 1 << INDEX_FLAGS.indexOf("demo.PriceReduced");
  const acc = {};
  for (const row of Object.values(index || {})) {
    const county = row[col.County], group = GROUP[row[col.PropertyType]];
    if (!group || !wanted.includes(county)) continue;
    const price = Number(row[col.ListPrice]), area = Number(row[col.LivingArea]), dom = row[col["demo.DaysOnMarket"]];
    const k = `${county}|${group}`;
    const a = (acc[k] ||= { county, group, count: 0, prices: [], ppsf: [], dom: [], newThisWeek: 0, reduced: 0 });
    a.count++;
    if (price > 0) a.prices.push(price);
    if (price > 0 && area > 200) a.ppsf.push(price / area);
    if (Number.isFinite(Number(dom)) && dom !== null) { a.dom.push(Number(dom)); if (Number(dom) <= 7) a.newThisWeek++; }
    if (row[INDEX_FIELDS.length] & flagBit) a.reduced++;
  }
  return Object.values(acc).map((a) => ({
    county: a.county, group: a.group, active: a.count, newThisWeek: a.newThisWeek,
    medianPrice: median(a.prices), medianPricePerSqFt: a.ppsf.length ? Math.round(median(a.ppsf)) : null,
    medianDaysOnMarket: median(a.dom), reducedShare: a.count ? Math.round((a.reduced / a.count) * 100) : null,
  })).sort((x, y) => x.county.localeCompare(y.county) || x.group.localeCompare(y.group));
}

/* ---------------- drafts ---------------- */

const fmt$ = (n, es) => (n == null ? "—" : `$${Math.round(n).toLocaleString(es ? "es-US" : "en-US")}`);
const fmtN = (n, es) => Number(n || 0).toLocaleString(es ? "es-US" : "en-US");
const MONTHS = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] };
const ymLabel = (ym, es) => { const [y, m] = ym.split("-"); return `${MONTHS[es ? "es" : "en"][Number(m) - 1]} ${y}`; };
const pct = (a, b) => (a && b ? Math.round(((a - b) / b) * 100) : null);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const G = { en: { "single-family": "single-family homes", condo: "condos" }, es: { "single-family": "casas unifamiliares", condo: "condominios" } };
const GT = { en: { "single-family": "Single-family homes", condo: "Condos and townhouses" }, es: { "single-family": "Casas unifamiliares", condo: "Condominios y townhouses" } };

/** Last 3 complete months vs the same months a year earlier, per group (true medians from the data job). */
export function salesSummary(c) {
  if (Array.isArray(c.summary)) {
    return c.summary.map((x) => ({ group: x.group, from: x.from, to: x.to, sales: x.count, median: x.median, yoy: x.priorMedian ? pct(x.median, x.priorMedian) : null }));
  }
  // Older data without a summary: monthly medians weighted by sales (approximate).
  const out = [];
  for (const group of ["single-family", "condo"]) {
    const rows = (c.months || []).filter((m) => m.group === group);
    const last = rows.slice(-3);
    if (!last.length) continue;
    const prior = last.map((m) => rows.find((x) => x.ym === `${Number(m.ym.slice(0, 4)) - 1}${m.ym.slice(4)}`)).filter(Boolean);
    const wavg = (list) => { const n = list.reduce((s, m) => s + m.count, 0); return n ? Math.round(list.reduce((s, m) => s + m.median * m.count, 0) / n) : null; };
    out.push({ group, from: last[0].ym, to: last.at(-1).ym, sales: last.reduce((s, m) => s + m.count, 0), median: wavg(last),
      yoy: prior.length === last.length ? pct(wavg(last), wavg(prior)) : null });
  }
  return out;
}

/** { en: { public, private }, es: { public, private } }: "public" is the publishable part (public records only). */
export function draftReport({ week, sales, mls, prevMls }) {
  const make = (lang) => {
    const es = lang === "es";
    const pub = [], priv = [];
    pub.push(es ? `Mercado de viviendas del sur de la Florida, semana del ${week}` : `South Florida housing market, week of ${week}`);
    pub.push("");
    pub.push(es ? "VENTAS CERRADAS (registros públicos)" : "CLOSED SALES (public records)");
    for (const [county, c] of Object.entries(sales?.counties || {})) {
      for (const s of salesSummary(c)) {
        const range = `${ymLabel(s.from, es)}–${ymLabel(s.to, es)}`;
        const yoy = s.yoy == null ? "" : es ? ` (${signed(s.yoy)}% frente al mismo período del año anterior)` : ` (${signed(s.yoy)}% vs. the same months a year earlier)`;
        pub.push(es
          ? `• Condado de ${county}, ${G.es[s.group]}: ${fmtN(s.sales, es)} ventas calificadas en ${range}; precio mediano ${fmt$(s.median, es)}${yoy}.`
          : `• ${county} County ${G.en[s.group]}: ${fmtN(s.sales, es)} qualified sales in ${range}; median price ${fmt$(s.median, es)}${yoy}.`);
      }
    }
    if (!Object.keys(sales?.counties || {}).length) pub.push(es ? "• Aún no hay datos de ventas." : "• No sales data yet.");
    pub.push(es
      ? `Fuente: archivos de ventas del registro tributario del Departamento de Ingresos de la Florida${sales?.date ? ` (actualizado ${sales.date})` : ""}. Ventas calificadas (entre partes independientes) de viviendas existentes; los meses más recientes pueden estar incompletos.`
      : `Source: Florida Department of Revenue tax roll sales files${sales?.date ? ` (as of ${sales.date})` : ""}. Qualified arm's-length sales of improved homes; the latest months may still be filling in.`);

    priv.push(es ? "ANUNCIOS ACTIVOS (datos de BeachesMLS: NO PUBLICAR hasta que BeachesMLS lo autorice)" : "ACTIVE LISTINGS (BeachesMLS data: DO NOT PUBLISH until BeachesMLS confirms)");
    for (const m of mls || []) {
      const p = (prevMls || []).find((x) => x.county === m.county && x.group === m.group);
      const ch = p ? (es ? `, ${signed(m.active - p.active)} desde la semana pasada` : `, ${signed(m.active - p.active)} since last week`) : "";
      priv.push(es
        ? `• ${m.county}, ${GT.es[m.group].toLowerCase()}: ${fmtN(m.active, es)} en venta${ch}; ${fmtN(m.newThisWeek, es)} ${m.newThisWeek === 1 ? "nuevo" : "nuevos"} esta semana; precio mediano ${fmt$(m.medianPrice, es)} (${fmt$(m.medianPricePerSqFt, es)}/pie²); ${m.medianDaysOnMarket ?? "—"} días medianos en el mercado; ${m.reducedShare ?? "—"}% con rebaja.`
        : `• ${m.county} ${GT.en[m.group].toLowerCase()}: ${fmtN(m.active, es)} for sale${ch}; ${fmtN(m.newThisWeek, es)} new this week; median asking price ${fmt$(m.medianPrice, es)} (${fmt$(m.medianPricePerSqFt, es)}/sq ft); median ${m.medianDaysOnMarket ?? "—"} days on market; ${m.reducedShare ?? "—"}% with a price cut.`);
    }
    return { public: pub.join("\n"), private: priv.join("\n") };
  };
  return { en: make("en"), es: make("es") };
}

/* ---------------- storage ---------------- */

/** This week's data and draft (snapshotting this week's MLS stats the first time it's opened). */
export async function currentReport() {
  const week = weekOf();
  const sales = await getJSON("market/sales");
  let snap = await getJSON(`market/mls/${week}`);
  if (!snap) {
    snap = { at: new Date().toISOString(), stats: mlsStats(await readIndex()) };
    await setJSON(`market/mls/${week}`, snap);
    const weeks = [week, ...(((await getJSON("market/weeks")) || []).filter((w) => w !== week))].sort().reverse().slice(0, 104);
    await setJSON("market/weeks", weeks);
  }
  const weeks = (await getJSON("market/weeks")) || [week];
  const prevWeek = weeks.find((w) => w < week);
  const prev = prevWeek ? await getJSON(`market/mls/${prevWeek}`) : null;
  const saved = await getJSON(`market/report/${week}`);
  const draft = draftReport({ week, sales, mls: snap.stats, prevMls: prev?.stats });
  return { week, prevWeek: prevWeek || null, sales, mls: snap.stats, mlsAt: snap.at, draft, saved, weeks };
}

export async function saveReport(week, { en, es, status }, user) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(week)) || !["draft", "approved"].includes(status)) return null;
  const r = { week, status, en: String(en || "").slice(0, 20000), es: String(es || "").slice(0, 20000), at: new Date().toISOString(), by: user?.email || null };
  await setJSON(`market/report/${week}`, r);
  return r;
}
