// POST /api/auth/logout — ends the session.
import { clearCookie, json } from "../lib/auth.mjs";

export default async (req) => json({ ok: true }, { headers: { "Set-Cookie": clearCookie(req) } });

export const config = { path: "/api/auth/logout" };
