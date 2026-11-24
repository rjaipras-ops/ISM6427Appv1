import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The site's upload function, with local file storage instead of Netlify Blobs.
const dir = mkdtempSync(join(tmpdir(), "records-"));
process.env.IDX_CACHE_DIR = dir;
process.env.RECORDS_UPLOAD_SECRET = "test-secret-0123456789abcdefghij";
const { default: upload } = await import("../../../netlify/functions/records-upload.mjs");

const report = { date: "2026-11-24", runAt: "2026-11-24T10:42:00Z", taxYear: 2026, counties: { "Palm Beach": { listings: 1 } }, items: [{ id: "K1", flags: [], private: { score: 0 } }] };
const post = (body, headers = {}) => upload(new Request("https://itoured.com/api/records/upload", {
  method: "POST", body, headers: { Authorization: `Bearer ${process.env.RECORDS_UPLOAD_SECRET}`, ...headers },
}));

test("upload: gzip sent as base64 text (how the daily job sends it) is stored", async () => {
  const res = await post(gzipSync(JSON.stringify(report)).toString("base64"), { "Content-Type": "text/plain", "X-Body-Encoding": "gzip-base64" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, date: "2026-11-24", items: 1 });
  assert.equal(JSON.parse(readFileSync(join(dir, "records/report/2026-11-24.json"), "utf8")).items[0].id, "K1");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "records/dates.json"), "utf8")), ["2026-11-24"]);
});

test("upload: plain JSON is accepted; wrong secret and bad bodies are refused", async () => {
  assert.equal((await post(JSON.stringify(report), { "Content-Type": "application/json" })).status, 200);
  const bad = await upload(new Request("https://itoured.com/api/records/upload", { method: "POST", body: "{}", headers: { Authorization: "Bearer wrong-secret-0123456789abcdef" } }));
  assert.equal(bad.status, 403);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post(JSON.stringify({ date: "x" }))).status, 400);
});
