// POST /api/records/upload — the daily public record check (GitHub Actions) sends its private
// report here, gzip-compressed, with Authorization: Bearer <RECORDS_UPLOAD_SECRET>.
import { gunzipSync } from "node:zlib";
import { json } from "../lib/auth.mjs";
import { uploadAllowed, saveReport } from "../lib/records.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, { status: 405 });
  if (!uploadAllowed(req)) return json({ error: "Not allowed" }, { status: 403 });
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    // The body arrives compressed unless something on the way already expanded it.
    const text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
    return json(await saveReport(JSON.parse(text)));
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 200) }, { status: 400 });
  }
};

export const config = { path: "/api/records/upload" };
