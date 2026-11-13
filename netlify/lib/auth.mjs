// Sign-in with Google + site sessions.
//
// The browser gets a Google ID token from Google's own sign-in button (Google Identity Services).
// We verify it here (signature against Google's public keys, issuer, audience = our client ID,
// expiry, verified email), then set our own signed, HttpOnly session cookie. No passwords are
// ever handled by this site.
//
// Env:
//   GOOGLE_CLIENT_ID   OAuth 2.0 Web client ID from Google Cloud Console (public, not a secret)
//   SESSION_SECRET     optional; if unset a random secret is generated once and kept in Blobs
//   AUTH_DEV_LOGIN     "true" only for local testing: allows a fake email sign-in (never on Netlify)

import { createHmac, createPublicKey, createHash, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { getJSON, setJSON } from "./store.mjs";

const COOKIE = "toured_session";
const SESSION_DAYS = 30;
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || "").trim();
export const devLoginEnabled = () => process.env.AUTH_DEV_LOGIN === "true" && !process.env.NETLIFY && !process.env.NETLIFY_BLOBS_CONTEXT;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fromB64url = (s) => Buffer.from(s, "base64url");

/* ---------------- Google ID token ---------------- */
let jwks = { keys: null, fetchedAt: 0 };
async function googleKeys(forceRefresh = false) {
  if (!forceRefresh && jwks.keys && Date.now() - jwks.fetchedAt < 6 * 3600e3) return jwks.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Couldn't load Google keys (${res.status})`);
  jwks = { keys: (await res.json()).keys || [], fetchedAt: Date.now() };
  return jwks.keys;
}

/** Verifies a Google ID token and returns its claims, or throws. */
export async function verifyGoogleIdToken(token) {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in isn't configured");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const header = JSON.parse(fromB64url(parts[0]));
  const claims = JSON.parse(fromB64url(parts[1]));
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");
  let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) throw new Error("Unknown signing key");
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), fromB64url(parts[2]));
  if (!ok) throw new Error("Bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.has(claims.iss)) throw new Error("Wrong issuer");
  if (claims.aud !== clientId) throw new Error("Token is for a different app");
  if (!claims.exp || claims.exp < now - 60) throw new Error("Token expired");
  if (!claims.email || claims.email_verified !== true) throw new Error("Google email isn't verified");
  return claims;
}

/** Public name shown on reviews: first name + last initial ("Maria G."). */
export function publicName({ given_name, family_name, name, email }) {
  const first = (given_name || (name || "").split(/\s+/)[0] || email.split("@")[0]).trim();
  const last = (family_name || (name || "").split(/\s+/).slice(1).join(" ")).trim();
  return (last ? `${first} ${last[0].toUpperCase()}.` : first).slice(0, 40);
}

/** Stable, non-reversible user id (doesn't expose the Google account id). */
export const userIdFor = (provider, subject) => `${provider[0]}_${createHash("sha256").update(`${provider}:${subject}`).digest("hex").slice(0, 24)}`;

/** Creates/updates the private user record (email is never shown publicly). Returns the public user. */
export async function upsertUser({ id, displayName, email, picture, provider }) {
  const key = `users/${id}`;
  const prev = (await getJSON(key)) || {};
  const now = new Date().toISOString();
  const rec = { id, displayName: prev.displayName || displayName, email, picture: picture || null, provider, createdAt: prev.createdAt || now, lastLoginAt: now };
  await setJSON(key, rec);
  return { id, displayName: rec.displayName, email, picture: rec.picture };
}

/* ---------------- sessions ---------------- */
let secretPromise;
async function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  secretPromise ||= (async () => {
    let s = await getJSON("auth/secret");
    if (!s?.value) { s = { value: b64url(randomBytes(32)), createdAt: new Date().toISOString() }; await setJSON("auth/secret", s); }
    return s.value;
  })();
  return secretPromise;
}

async function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(createHmac("sha256", await sessionSecret()).update(body).digest());
  return `${body}.${mac}`;
}

async function unsign(token) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", await sessionSecret()).update(body).digest();
  const got = fromB64url(mac);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const p = JSON.parse(fromB64url(body));
  return p.exp > Date.now() ? p : null;
}

function readCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const secureFlag = (req) => (new URL(req.url).protocol === "https:" ? "; Secure" : "");

/** Set-Cookie header value that signs the user in. */
export async function sessionCookie(req, user) {
  const token = await sign({ id: user.id, n: user.displayName, e: user.email, p: user.picture || null, exp: Date.now() + SESSION_DAYS * 864e5 });
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureFlag(req)}`;
}
export const clearCookie = (req) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;

/** The signed-in user for this request, or null. */
export async function sessionUser(req) {
  try {
    const p = await unsign(readCookie(req, COOKIE));
    return p ? { id: p.id, displayName: p.n, email: p.e, picture: p.p } : null;
  } catch { return null; }
}

/** Rejects cross-site POSTs (defence in depth on top of SameSite=Lax). */
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

export const json = (data, init = {}) => Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
