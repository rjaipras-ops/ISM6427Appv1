import { test } from "node:test";
import assert from "node:assert/strict";
import { leadFromSubmission, triage, redact, aiPrompt, templateReply, referralSummary, listingSnapshot } from "../netlify/lib/leads.mjs";

const sub = (data, extra = {}) => ({ payload: { form_name: "contact", id: "abc123", created_at: "2026-11-26T15:00:00Z", data, ...extra } });
const base = { name: "Maria Lopez", email: "Maria@Example.com", phone: "(561) 555-0142", timeline: "Within 3 months", financing: "Pre-approved",
  has_agent: "No", message: "Can I see it Saturday? Call me at 561-555-0142 or maria@example.com", page: "https://itoured.com/#/home/2026A1B2", consent: "yes",
  consent_version: "2026-11-24", consent_at: "2026-11-26T15:00:00Z", consent_text: "I agree…", language: "Spanish", home: "1 Ocean Dr" };

test("leadFromSubmission reads the Netlify payload and the listing key", () => {
  const l = leadFromSubmission(sub(base));
  assert.equal(l.id, "abc123");
  assert.equal(l.email, "maria@example.com");
  assert.equal(l.listingKey, "2026A1B2");
  assert.equal(l.language, "Spanish");
  assert.equal(l.consent.given, true);
  assert.equal(l.status, "new");
});

test("leadFromSubmission ignores other forms, honeypot hits and empty contacts", () => {
  assert.equal(leadFromSubmission({ payload: { form_name: "other", data: base } }), null);
  assert.equal(leadFromSubmission(sub({ ...base, company: "bot" })), null);
  assert.equal(leadFromSubmission(sub({ ...base, email: "", phone: "" })), null);
  assert.ok(leadFromSubmission({ data: { ...base, "form-name": "contact" } }), "newer event shape");
});

test("triage: priority and handle/refer", () => {
  const l = leadFromSubmission(sub(base));
  assert.equal(triage(l, { county: "Palm Beach" }, ["Palm Beach"]).priority, "hot");
  assert.equal(triage(l, { county: "Palm Beach" }, ["Palm Beach"]).suggestion, "handle");
  assert.equal(triage(l, { county: "Lee" }, ["Palm Beach", "Broward"]).suggestion, "refer");
  assert.equal(triage(l, { county: "Lee" }, []).suggestion, "handle", "no counties set: handle");
  assert.equal(triage({ ...l, timeline: "Just browsing", financing: "Not yet pre-approved" }, null).priority, "nurture");
  assert.equal(triage({ ...l, timeline: "3–6 months" }, null).priority, "warm");
  assert.equal(triage({ ...l, financing: "Not yet pre-approved" }, null).priority, "warm");
});

test("redact removes the name, emails, phone numbers and links", () => {
  const l = leadFromSubmission(sub(base));
  const t = redact("Hi, I'm Maria Lopez, 561-555-0142, maria@example.com, see www.example.com/x", l);
  assert.ok(!/maria|lopez|555|example/i.test(t), t);
});

test("the AI prompt never contains contact details", () => {
  const l = leadFromSubmission(sub(base));
  const p = aiPrompt(l, { address: "1 Ocean Dr, Boca Raton, FL 33432", type: "Condo", beds: 2, baths: 2, price: 450000 });
  for (const s of ["Maria", "Lopez", "maria@example.com", "555-0142", "(561)"]) assert.ok(!p.includes(s), `${s} leaked`);
  assert.ok(p.includes("Language: Spanish"));
});

test("standard reply in the visitor's language; referral text has the details", () => {
  const l = leadFromSubmission(sub(base));
  const li = { address: "1 Ocean Dr, Boca Raton, FL 33432", price: 450000, mls: "RX-1", county: "Palm Beach" };
  const es = templateReply(l, li, { name: "Agent", brokerage: "LoKation Real Estate" });
  assert.match(es.body, /^Hola Maria:/);
  assert.match(es.subject, /Su visita/);
  const en = templateReply({ ...l, language: "English" }, li, {});
  assert.match(en.body, /^Hi Maria,/);
  const ref = referralSummary(l, li);
  assert.match(ref, /maria@example.com/);
  assert.match(ref, /MLS RX-1/);
  assert.match(ref, /version 2026-11-24/);
});

test("listingSnapshot keeps only public listing fields", () => {
  const s = listingSnapshot({ ListingKey: "k", UnparsedAddress: "a", County: "Broward", ListPrice: 1, ListOfficeEmail: "x@y.z", PublicRemarks: "long" });
  assert.equal(s.key, "k");
  assert.ok(!("ListOfficeEmail" in s) && !("PublicRemarks" in s));
});
