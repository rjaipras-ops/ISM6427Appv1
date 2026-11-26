// Site owner only (ADMIN_EMAILS). Weekly market report drafts (lib/market.mjs).
// GET  /api/admin/market                                   — this week's numbers and drafts
// POST /api/admin/market { week, en, es, status }          — save the publishable text as draft or approved
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { isAdmin } from "../lib/moderation.mjs";
import { currentReport, saveReport } from "../lib/market.mjs";

export default async (req) => {
  const user = await sessionUser(req);
  if (!isAdmin(user)) return json({ error: "Not allowed" }, { status: 403 });
  if (req.method === "GET") return json(await currentReport());
  if (req.method !== "POST" || !sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const r = await saveReport(...(({ week, ...rest }) => [week, rest])(await req.json().catch(() => ({}))), user);
  return r ? json(r) : json({ error: "Bad request" }, { status: 400 });
};

export const config = { path: "/api/admin/market" };
