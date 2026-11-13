// POST /api/auth/dev  { name, email } — LOCAL TESTING ONLY (AUTH_DEV_LOGIN=true, never on Netlify).
import { devLoginEnabled, userIdFor, upsertUser, sessionCookie, json } from "../lib/auth.mjs";

export default async (req) => {
  if (!devLoginEnabled() || req.method !== "POST") return json({ error: "Not found" }, { status: 404 });
  const { name = "", email = "" } = await req.json().catch(() => ({}));
  if (!name.trim() || !/^\S+@\S+$/.test(email)) return json({ error: "Name and email required" }, { status: 400 });
  const user = await upsertUser({ id: userIdFor("dev", email.toLowerCase()), displayName: name.trim().slice(0, 40), email: email.toLowerCase(), provider: "dev" });
  return json({ user }, { headers: { "Set-Cookie": await sessionCookie(req, user) } });
};

export const config = { path: "/api/auth/dev" };
