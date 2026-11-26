// Private public-record check reports (scripts/records/daily.mjs builds them in GitHub Actions).
// Stored in Netlify Blobs only, never as site files; read only through the admin endpoint.
//
// Keys:
//   records/report/<YYYY-MM-DD>   one day's report: { date, runAt, taxYear, counties, items[] }
//   records/dates                 report dates kept, newest first
//   records/status                the owner's review status per listing: { [listingId]: { status, note, at, flags } }

import { createHash, timingSafeEqual } from "node:crypto";
import { getJSON, setJSON, del } from "./store.mjs";
import { followUp, outreachFlags } from "../../js/outreach.js";

const KEEP = 30;
export const STATUSES = { new: "New", confirmed: "Confirmed", false_alarm: "False alarm", contacted_agent: "Contacted listing agent" };

/** Constant-time check of the uploader's bearer token against RECORDS_UPLOAD_SECRET. */
export function uploadAllowed(req) {
  const secret = (process.env.RECORDS_UPLOAD_SECRET || "").trim();
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (secret.length < 24 || !got) return false;
  const h = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(secret), h(got));
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

/** Validates and stores an uploaded report. Returns { ok, date, items } or throws. */
export async function saveReport(report) {
  if (!report || typeof report !== "object" || !isDate(report.date) || !Array.isArray(report.items) || typeof report.counties !== "object") {
    throw new Error("Not a record check report");
  }
  if (report.items.length > 60000) throw new Error("Too many items");
  await setJSON(`records/report/${report.date}`, report);
  const dates = [report.date, ...((await getJSON("records/dates")) || []).filter((d) => d !== report.date)].sort().reverse();
  for (const d of dates.slice(KEEP)) await del(`records/report/${d}`).catch(() => {});
  await setJSON("records/dates", dates.slice(0, KEEP));
  return { ok: true, date: report.date, items: report.items.length };
}

let memo = null; // last report read by this function instance
async function loadReport(date) {
  const dates = (await getJSON("records/dates")) || [];
  const d = isDate(date) && dates.includes(date) ? date : dates[0];
  if (!d) return { dates, report: null };
  if (memo?.date !== d) memo = { date: d, report: await getJSON(`records/report/${d}`) };
  return { dates, report: memo.report };
}

const flagSig = (it) => it.flags.map((f) => f.check).concat(it.private.closerLook ? ["closer look"] : []).sort().join("|");

/**
 * One page of the report for the admin page, with the owner's statuses.
 * Filters: county, check (a check name, or "closer" for private closer-look items), status, q (address/MLS), page.
 */
export async function reportPage({ date, county, check, status, q, page = 1, size = 50 } = {}) {
  const { dates, report } = await loadReport(date);
  if (!report) return { dates, report: null };
  const statuses = (await getJSON("records/status")) || {};
  const needle = String(q || "").trim().toLowerCase();
  let items = report.items.map((it) => {
    const s = statuses[it.id];
    const row = { ...it, status: s?.status || "new", statusNote: s?.note || "", statusAt: s?.contactedAt || s?.at || null, flagsChanged: !!(s && s.flags && s.flags !== flagSig(it)) };
    return { ...row, outreach: outreachFlags(row).length > 0, followUp: followUp(row) };
  });
  // Listings the owner emailed that no longer differ (fixed, sold or withdrawn: they leave the report).
  const inReport = new Map(items.map((it) => [it.id, it]));
  const contacted = Object.entries(statuses).filter(([, s]) => s.status === "contacted_agent");
  const resolved = contacted.filter(([id]) => !inReport.get(id)?.outreach).length;
  const followUpsDue = items.filter((it) => it.followUp?.due).length;
  if (county) items = items.filter((it) => it.county === county);
  if (check === "closer") items = items.filter((it) => it.private.closerLook);
  else if (check) items = items.filter((it) => it.flags.some((f) => f.check === check));
  if (status === "followup") items = items.filter((it) => it.followUp?.due);
  else if (status && status !== "all") items = items.filter((it) => (status === "open" ? ["new"].includes(it.status) || it.flagsChanged : it.status === status));
  if (needle) items = items.filter((it) => `${it.street} ${it.city} ${it.zip} ${it.mls}`.toLowerCase().includes(needle));
  // Most to look at first: closer-look score, then number of flags.
  items.sort((a, b) => (b.private.score - a.private.score) || (b.flags.length - a.flags.length) || String(a.street).localeCompare(String(b.street)));
  page = Math.max(1, Number(page) || 1);
  const checks = [...new Set(report.items.flatMap((it) => it.flags.map((f) => f.check)))].sort();
  return {
    dates, date: report.date, runAt: report.runAt, taxYear: report.taxYear, counties: report.counties, checks, statuses: STATUSES, followUpsDue, resolved,
    total: items.length, page, pages: Math.max(1, Math.ceil(items.length / size)), items: items.slice((page - 1) * size, page * size),
  };
}

/** Sets the owner's status for one listing. */
export async function setStatus(id, status, note, user, emailed = false) {
  if (!/^[\w-]{1,80}$/.test(String(id)) || !(status in STATUSES)) return null;
  const all = (await getJSON("records/status")) || {};
  const { report } = await loadReport();
  const it = report?.items.find((x) => x.id === id);
  const prev = all[id];
  const now = new Date().toISOString();
  // contactedAt: when the listing office was (last) emailed; changing only the note keeps it.
  const contactedAt = status === "contacted_agent" ? (emailed || prev?.status !== "contacted_agent" ? now : prev.contactedAt || prev.at) : undefined;
  if (status === "new") delete all[id];
  else all[id] = { status, note: String(note || "").slice(0, 500), at: now, by: user?.email || null, flags: it ? flagSig(it) : null, ...(contactedAt ? { contactedAt } : {}) };
  await setJSON("records/status", all);
  return all[id] || { status: "new" };
}
