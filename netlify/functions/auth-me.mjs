// GET /api/auth/me — the signed-in user (from the session cookie), or null.
import { sessionUser, json } from "../lib/auth.mjs";

export default async (req) => json({ user: await sessionUser(req) });

export const config = { path: "/api/auth/me" };
