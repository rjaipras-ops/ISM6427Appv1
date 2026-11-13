// POST /api/auth/google  { credential }  — verifies a Google ID token and starts a session.
import { verifyGoogleIdToken, publicName, userIdFor, upsertUser, sessionCookie, sameOrigin, json } from "../lib/auth.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, { status: 405 });
  if (!sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  let credential;
  try { ({ credential } = await req.json()); } catch { return json({ error: "Bad request" }, { status: 400 }); }
  try {
    const c = await verifyGoogleIdToken(credential);
    const user = await upsertUser({ id: userIdFor("google", c.sub), displayName: publicName(c), email: c.email.toLowerCase(), picture: c.picture, provider: "google" });
    return json({ user }, { headers: { "Set-Cookie": await sessionCookie(req, user) } });
  } catch (e) {
    console.warn("[auth] Google sign-in rejected:", e.message);
    return json({ error: "Google sign-in failed. Please try again." }, { status: 401 });
  }
};

export const config = { path: "/api/auth/google" };
