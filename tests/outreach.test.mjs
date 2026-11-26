import { test } from "node:test";
import assert from "node:assert/strict";
import { outreachEmail, outreachFlags, followUp, FOLLOW_UP_DAYS } from "../js/outreach.js";

const item = {
  id: "k1", mls: "RX-123", county: "Palm Beach", street: "10 Palm Way", city: "Jupiter", status: "new",
  flags: [
    { check: "Living area (sq ft)", listing: "2,400", record: "1,900", note: "Listing is 26% larger…" },
    { check: "Last sale", listing: null, record: "2026-03-01 $400,000", note: "Resold within 12 months" },
    { check: "Homestead and value", listing: null, record: "Homestead", note: "x" },
  ],
  private: { signals: [{ note: "Owner mailing address out of state" }], closerLook: true, score: 4 },
};

test("only listing-vs-record checks go to the office", () => {
  assert.deepEqual(outreachFlags(item).map((f) => f.check), ["Living area (sq ft)"]);
  const e = outreachEmail(item, { agent: { name: "A Agent", brokerage: "LoKation Real Estate" }, source: "2026 final tax roll" });
  assert.match(e.subject, /10 Palm Way \(MLS RX-123\)/);
  assert.match(e.body, /listing shows 2,400; the tax roll shows 1,900/);
  assert.match(e.body, /Palm Beach County tax roll \(Florida Department of Revenue, 2026 final tax roll\)/);
  for (const bad of ["Last sale", "400,000", "Homestead", "out of state", "26%"]) assert.ok(!e.body.includes(bad), `${bad} leaked`);
  assert.match(e.body, /LoKation Real Estate$/);
});

test("follow-up wording and timing", () => {
  const at = new Date(Date.now() - (FOLLOW_UP_DAYS + 1) * 864e5).toISOString();
  const contacted = { ...item, status: "contacted_agent", statusAt: at };
  assert.equal(followUp(item), null);
  assert.deepEqual({ ...followUp(contacted), days: 0 }, { days: 0, due: true, resolved: false });
  assert.equal(followUp({ ...contacted, statusAt: new Date().toISOString() }).due, false);
  assert.equal(followUp({ ...contacted, flags: item.flags.slice(1) }).resolved, true);
  const e = outreachEmail(contacted, { followUpOf: at });
  assert.match(e.subject, /^Following up:/);
  assert.match(e.body, /following up on my note of/);
});
