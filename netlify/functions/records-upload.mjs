// POST /api/records/upload — the daily public record check (GitHub Actions) sends its private
// report here (gzip, base64-encoded, X-Body-Encoding: gzip-base64) with Authorization: Bearer <RECORDS_UPLOAD_SECRET>.
import { gunzipSync } from "node:zlib";
import { json } from "../lib/auth.mjs";
import { uploadAllowed, saveReport } from "../lib/records.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, { status: 405 });
  if (!uploadAllowed(req)) return json({ error: "Not allowed" }, { status: 403 });
  try {
    // The daily job sends gzip as base64 text: Netlify passes JSON/text bodies to functions as
    // strings, which would corrupt raw compressed bytes. Plain JSON is accepted too.
    const text = (await req.text()).trim();
    const json_ = req.headers.get("x-body-encoding") === "gzip-base64" ? gunzipSync(Buffer.from(text, "base64")).toString("utf8") : text;
    return json(await saveReport(JSON.parse(json_)));
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 200) }, { status: 400 });
  }
};

export const config = { path: "/api/records/upload" };
