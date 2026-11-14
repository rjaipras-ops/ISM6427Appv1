// Site owner only (ADMIN_EMAILS).
// GET  /api/admin/settings — { approveAll, reviewsDisabled, reportThreshold }
// POST /api/admin/settings — update any of those
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { isAdmin, getSettings, saveSettings } from "../lib/moderation.mjs";

export default async (req) => {
  const user = await sessionUser(req);
  if (!isAdmin(user)) return json({ error: "Not allowed" }, { status: 403 });
  if (req.method === "GET") return json(await getSettings());
  if (req.method !== "POST" || !sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const patch = {};
  for (const k of ["approveAll", "reviewsDisabled", "reportThreshold"]) if (k in body) patch[k] = body[k];
  return json(await saveSettings(patch));
};

export const config = { path: "/api/admin/settings" };
