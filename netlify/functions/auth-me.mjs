// GET /api/auth/me — the signed-in user (from the session cookie), or null. isAdmin for the site owner.
import { sessionUser, json } from "../lib/auth.mjs";
import { isAdmin } from "../lib/moderation.mjs";

export default async (req) => {
  const user = await sessionUser(req);
  return json({ user: user ? { ...user, isAdmin: isAdmin(user) } : null });
};

export const config = { path: "/api/auth/me" };
