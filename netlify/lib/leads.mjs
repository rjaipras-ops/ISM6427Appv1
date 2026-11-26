// Lead triage: private copies of tour requests for the site owner's "Leads" tab.
//
// Netlify Forms still emails each request (Forms → notifications). On every verified submission
// Netlify also calls netlify/functions/submission-created.mjs, which stores a copy here so the
// owner can sort, triage and answer from the admin page. Nothing here is ever shown publicly, and
// nothing is sent to anyone without the owner clicking Send in their own email or text app.
//
// Keys (Netlify Blobs, read only through the admin endpoint):
//   leads/index        newest first: [{ id, at, status, name, home, county, priority, suggestion, language }]
//   leads/item/<id>    the full request, consent record, triage and the owner's notes
//   leads/settings     { myCounties: [...] } counties the owner handles personally
//   leads/ai-<day>     AI drafts made that day (cap)
//
// Retention: LEAD_RETENTION_DAYS (default 1,825 = 5 years, longer than the 4-year limitation period
// for phone and text consent claims, so the consent record is still there if it is ever needed).
// The owner can delete a request sooner from the Leads tab.
//
// AI drafts: only when the owner clicks "Draft with AI". Contact details (name, email, phone, and any
// phone numbers, emails or links in the message) are removed before the text goes to the AI service.

import { createHash } from "node:crypto";
import { getJSON, setJSON, del } from "./store.mjs";

export const STATUSES = { new: "New", contacted: "Contacted", touring: "Touring scheduled", referred: "Referred", closed: "Closed", not_a_lead: "Not a lead / spam" };
const MAX_INDEX = 5000;
const RETENTION_DAYS = () => Number(process.env.LEAD_RETENTION_DAYS) || 1825;
const AI_DAILY_CAP = () => Number(process.env.LEAD_AI_DAILY_CAP) || 50;

const clip = (v, n) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, n);

/** A stored lead from a Netlify Forms submission ({ payload } or the newer { data } event), or null. */
export function leadFromSubmission(body) {
  const p = body?.payload || body || {};
  const d = p.data || {};
  const form = p.form_name || d["form-name"] || "";
  if (form !== "contact") return null;
  if (d.company) return null; // honeypot
  const name = clip(d.name, 80), email = clip(d.email, 120).toLowerCase(), phone = clip(d.phone, 30);
  if (!name || (!email && !phone)) return null;
  const page = clip(d.page, 500);
  const key = (page.match(/#\/home\/([\w-]{1,64})/) || [])[1] || null;
  const at = Date.parse(p.created_at) ? new Date(p.created_at).toISOString() : new Date().toISOString();
  const id = clip(p.id, 40).replace(/[^\w-]/g, "") || createHash("sha256").update(`${email}|${phone}|${at}`).digest("hex").slice(0, 24);
  return {
    id, at, status: "new", notes: "",
    name, email, phone,
    timeline: clip(d.timeline, 40), financing: clip(d.financing, 40), hasAgent: clip(d.has_agent, 5),
    message: clip(d.message, 2000), subject: clip(d.subject, 200), home: clip(d.home, 200),
    listingKey: key, page,
    language: /spanish|espa/i.test(d.language || "") ? "Spanish" : "English",
    consent: { given: /^(yes|on|true)$/i.test(d.consent || ""), text: clip(d.consent_text, 1200), version: clip(d.consent_version, 20), at: clip(d.consent_at, 40) },
  };
}

/** The parts of the listing the owner needs to triage (public listing data only). */
export function listingSnapshot(l) {
  if (!l) return null;
  return {
    key: l.ListingKey || l.ListingId, mls: l.MlsNumber || null, address: l.UnparsedAddress, city: l.City, county: l.County,
    price: l.ListPrice, type: l.PropertyType, beds: l.BedroomsTotal, baths: l.BathroomsTotalInteger,
    office: l.ListOfficeName || "", officePhone: l.ListOfficePhone || "",
  };
}

/**
 * Priority and a suggestion (handle it yourself, or refer it) with the reasons.
 * Rules, not AI, so the owner can see exactly why.
 */
export function triage(lead, listing, myCounties = []) {
  const reasons = [];
  const soon = /within 3/i.test(lead.timeline), mid = /3.6/i.test(lead.timeline), browsing = /brows/i.test(lead.timeline);
  const ready = /pre-approved|cash/i.test(lead.financing) && !/not yet/i.test(lead.financing);
  let priority = "nurture";
  if (soon && ready) priority = "hot";
  else if (soon || (mid && ready)) priority = "warm";
  reasons.push(`${lead.timeline || "No timeline"} · ${lead.financing || "financing not given"}`);
  if (browsing) reasons.push("Just browsing: a friendly reply, no pressure");
  if (lead.hasAgent === "Yes") { priority = "nurture"; reasons.push("Says they already have an agent: point them back to their agent"); }

  let suggestion = "handle";
  const mine = (myCounties || []).map((c) => String(c).toLowerCase());
  if (listing?.county && mine.length && !mine.includes(String(listing.county).toLowerCase())) {
    suggestion = "refer";
    reasons.push(`${listing.county} County isn't one of the counties you handle`);
  } else if (!listing) {
    reasons.push("General message (not about a specific listing)");
  }
  if (lead.language === "Spanish") reasons.push("Wrote from the Spanish site: reply in Spanish");
  return { priority, suggestion, reasons };
}

const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes the person's name, emails, phone numbers and links from text before it leaves the site. */
export function redact(text, lead = {}) {
  let t = String(text || "").replace(EMAIL, "[email]").replace(LINK, "[link]").replace(PHONE, "[phone]");
  for (const part of String(lead.name || "").split(/\s+/).filter((w) => w.length >= 2)) {
    t = t.replace(new RegExp(`\\b${escapeRe(part)}\\b`, "gi"), "[name]");
  }
  return t;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const money = (n) => (n ? `$${Math.round(n).toLocaleString("en-US")}` : "");

/** A reply the owner can send as is or edit. No AI involved. */
export function templateReply(lead, listing, agent = {}) {
  const fn = firstName(lead.name);
  const where = listing?.address || lead.home || "";
  const sign = [agent.name, agent.brokerage, agent.phone].filter(Boolean).join("\n");
  if (lead.language === "Spanish") {
    const intro = where ? `Gracias por su interés en ${where}.` : "Gracias por escribirnos.";
    const next = lead.hasAgent === "Yes" ? "Como ya trabaja con un agente, le recomiendo pedirle a su agente que coordine la visita."
      : /brows/i.test(lead.timeline) ? "Cuando quiera, con gusto le envío casas parecidas o información de la zona."
      : where ? "¿Qué días y horarios le quedan bien para visitarla? Puedo coordinar la visita con el corredor del anuncio."
      : "¿En qué le puedo ayudar?";
    return { subject: where ? `Su visita a ${where}` : "Su mensaje en iToured", body: `Hola ${fn}:\n\n${intro} ${next}\n\nSaludos,\n${sign}` };
  }
  const intro = where ? `Thanks for your interest in ${where}.` : "Thanks for reaching out.";
  const next = lead.hasAgent === "Yes" ? "Since you're already working with an agent, please ask them to set up the showing."
    : /brows/i.test(lead.timeline) ? "Whenever you're ready, I'm happy to send similar homes or details about the area."
    : where ? "What days and times work for you to see it? I'll set it up with the listing office."
    : "How can I help?";
  return { subject: where ? `Your tour of ${where}` : "Your message on iToured", body: `Hi ${fn},\n\n${intro} ${next}\n\nBest,\n${sign}` };
}

/** Text for a referral form (another agent or a referral network). Includes contact details: owner's eyes only. */
export function referralSummary(lead, listing) {
  const l = listing;
  return [
    "Buyer referral from itoured.com (LoKation Real Estate)",
    l ? `Home: ${l.address}${l.mls ? ` (MLS ${l.mls})` : ""}${l.price ? `, listed at ${money(l.price)}` : ""}${l.type ? `, ${l.type}` : ""}` : `Request: ${lead.subject || "general message"}`,
    `Timeline: ${lead.timeline || "not given"} · Financing: ${lead.financing || "not given"} · Has an agent: ${lead.hasAgent || "not given"}`,
    `Language: ${lead.language}`,
    lead.message ? `Message: ${lead.message}` : null,
    `Contact: ${lead.name} · ${lead.email} · ${lead.phone}`,
    `Contact consent: ${lead.consent.given ? `given ${lead.consent.at || lead.at} (wording version ${lead.consent.version || "?"})` : "not recorded"}`,
  ].filter(Boolean).join("\n");
}

const AI_INSTRUCTIONS = `You draft a short reply from a Florida real estate agent to a home buyer who sent a tour request
from the agent's website. Write in the language given. Be warm, brief (under 120 words) and specific to the request.
Start with a greeting that uses the placeholder [FIRST_NAME]. Ask one clear next-step question (days and times to tour,
or what they're looking for). Never promise anything about price, condition, the neighborhood, schools or safety.
Never describe who lives in an area. Don't invent facts about the home beyond what is given. No sign-off; it is added
afterwards. Return only the email body text.`;

const MODELS = () => [process.env.GEMINI_MODEL, "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"].filter(Boolean);

/** What the AI service sees: the public listing facts and the request, with contact details removed. */
export function aiPrompt(lead, listing) {
  return [
    `Language: ${lead.language}`,
    listing ? `Home: ${listing.address}, ${listing.type || "home"}, ${listing.beds || "?"} bd, ${listing.baths || "?"} ba, listed at ${money(listing.price)}` : "General message, not about a specific home",
    `Buyer timeline: ${lead.timeline || "not given"}`,
    `Financing: ${lead.financing || "not given"}`,
    `Already has an agent: ${lead.hasAgent || "not given"}`,
    `Their message: ${redact(lead.message, lead) || "(none)"}`,
  ].join("\n");
}

export const aiDraftEnabled = () => Boolean(process.env.GEMINI_API_KEY);

/** AI-written reply body (owner clicked "Draft with AI"). Throws with a plain message if unavailable. */
export async function aiReply(lead, listing, agent = {}) {
  if (!aiDraftEnabled()) throw new Error("AI drafts need GEMINI_API_KEY in Netlify.");
  const key = `leads/ai-${new Date().toISOString().slice(0, 10)}`;
  const used = Number(await getJSON(key).catch(() => 0)) || 0;
  if (used >= AI_DAILY_CAP()) throw new Error("Today's AI drafts are used up. Use the standard reply or try tomorrow.");
  await setJSON(key, used + 1);
  const body = {
    systemInstruction: { parts: [{ text: AI_INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: aiPrompt(lead, listing) }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
  };
  for (const model of MODELS()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    if (res.status === 404 || res.status === 400) continue;
    if (!res.ok) throw new Error(`The AI service didn't answer (${res.status}). Use the standard reply.`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!text) break;
    const sign = [agent.name, agent.brokerage, agent.phone].filter(Boolean).join("\n");
    const closing = lead.language === "Spanish" ? "Saludos," : "Best,";
    return `${text.replace(/\[FIRST_NAME\]/g, firstName(lead.name))}\n\n${closing}\n${sign}`;
  }
  throw new Error("The AI service returned nothing. Use the standard reply.");
}

/* ---------------- storage ---------------- */

export async function getLeadSettings() {
  return { myCounties: [], ...((await getJSON("leads/settings")) || {}) };
}
export async function saveLeadSettings(patch) {
  const s = await getLeadSettings();
  if (Array.isArray(patch?.myCounties)) s.myCounties = [...new Set(patch.myCounties.map((c) => clip(c, 40)).filter(Boolean))].slice(0, 30);
  await setJSON("leads/settings", s);
  return s;
}

const indexRow = (l) => ({ id: l.id, at: l.at, status: l.status, name: l.name, home: l.listing?.address || l.home || l.subject,
  county: l.listing?.county || "", priority: l.triage.priority, suggestion: l.triage.suggestion, language: l.language });

/** Stores a new lead (idempotent per submission id). `listing` is a listingSnapshot or null. */
export async function saveLead(lead, listing) {
  const existing = await getJSON(`leads/item/${lead.id}`);
  if (existing) return existing;
  const { myCounties } = await getLeadSettings();
  const full = { ...lead, listing, triage: triage(lead, listing, myCounties) };
  await setJSON(`leads/item/${lead.id}`, full);
  const index = (await getJSON("leads/index")) || [];
  await setJSON("leads/index", [indexRow(full), ...index.filter((r) => r.id !== lead.id)].slice(0, MAX_INDEX));
  return full;
}

/** The index, after removing leads past the retention period. */
export async function listLeads() {
  const index = (await getJSON("leads/index")) || [];
  const cutoff = Date.now() - RETENTION_DAYS() * 864e5;
  const keep = index.filter((r) => Date.parse(r.at) >= cutoff);
  if (keep.length !== index.length) {
    for (const r of index.filter((x) => !keep.includes(x))) await del(`leads/item/${r.id}`).catch(() => {});
    await setJSON("leads/index", keep);
  }
  return keep;
}

export const getLead = (id) => (/^[\w-]{1,40}$/.test(String(id)) ? getJSON(`leads/item/${id}`) : null);

export async function updateLead(id, { status, notes } = {}, user) {
  const lead = await getLead(id);
  if (!lead) return null;
  if (status !== undefined) {
    if (!STATUSES[status]) return null;
    lead.status = status;
  }
  if (notes !== undefined) lead.notes = clip(notes, 2000);
  lead.updatedAt = new Date().toISOString();
  lead.updatedBy = user?.email ? createHash("sha256").update(user.email).digest("hex").slice(0, 8) : null;
  await setJSON(`leads/item/${id}`, lead);
  const index = (await getJSON("leads/index")) || [];
  await setJSON("leads/index", index.map((r) => (r.id === id ? indexRow(lead) : r)));
  return lead;
}

export async function deleteLead(id) {
  if (!(await getLead(id))) return false;
  await del(`leads/item/${id}`);
  const index = (await getJSON("leads/index")) || [];
  await setJSON("leads/index", index.filter((r) => r.id !== id));
  return true;
}
