// Site owner only (ADMIN_EMAILS). The private public-record check report.
// GET  /api/admin/records?date=&county=&check=&status=&q=&page=   — one page of items
// POST /api/admin/records  { id, status, note }                   — set a listing's review status
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { isAdmin } from "../lib/moderation.mjs";
import { reportPage, setStatus } from "../lib/records.mjs";

export default async (req) => {
  const user = await sessionUser(req);
  if (!isAdmin(user)) return json({ error: "Not allowed" }, { status: 403 });
  if (req.method === "GET") {
    const p = Object.fromEntries(new URL(req.url).searchParams);
    return json(await reportPage(p));
  }
  if (req.method !== "POST" || !sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const { id, status, note } = await req.json().catch(() => ({}));
  const s = await setStatus(id, status, note, user);
  return s ? json({ ok: true, ...s }) : json({ error: "Bad request" }, { status: 400 });
};

export const config = { path: "/api/admin/records" };
