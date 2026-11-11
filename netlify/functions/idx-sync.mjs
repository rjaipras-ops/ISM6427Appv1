// POST /api/idx/sync — force a sync run now.
// Requires header "Authorization: Bearer <IDX_SYNC_SECRET>". Disabled if IDX_SYNC_SECRET is empty.
// Long syncs (the first full sync) continue automatically on the next scheduled runs.
import { timingSafeEqual } from "node:crypto";
import { runSync, syncStatus } from "../lib/sync.mjs";
import { idxConfig } from "../lib/config.mjs";

function authorized(req, secret) {
  const got = Buffer.from((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405, headers: { Allow: "POST" } });
  const { syncSecret } = idxConfig();
  if (!syncSecret) return Response.json({ error: "Manual sync is disabled. Set IDX_SYNC_SECRET to enable it." }, { status: 403 });
  if (!authorized(req, syncSecret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runSync({ force: true, reason: "manual" });
  return Response.json({ ok: r.ok !== false, finished: r.finished ?? true, status: await syncStatus() }, { headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/idx/sync" };
