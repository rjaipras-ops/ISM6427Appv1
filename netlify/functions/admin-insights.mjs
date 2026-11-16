// GET /api/admin/insights?days=30 — search insights for the site owner (ADMIN_EMAILS) only.
import { sessionUser, json } from "../lib/auth.mjs";
import { isAdmin } from "../lib/moderation.mjs";
import { summary } from "../lib/insights.mjs";

export default async (req) => {
  if (!isAdmin(await sessionUser(req))) return json({ error: "Not allowed" }, { status: 403 });
  return json(await summary(new URL(req.url).searchParams.get("days")));
};

export const config = { path: "/api/admin/insights" };
