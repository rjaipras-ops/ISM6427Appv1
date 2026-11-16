// POST /api/search/ai  { text } — AI reading of a plain-English search (see netlify/lib/ai-search.mjs).
// GET  /api/search/ai  — { enabled } so the app knows whether to offer it.
import { aiSearch, aiSearchEnabled } from "../lib/ai-search.mjs";
import { json } from "../lib/auth.mjs";

export default async (req, context) => {
  if (req.method === "GET") return json({ enabled: aiSearchEnabled() });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const visitor = context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "";
  const r = await aiSearch(body.text, visitor);
  if (!r.ok) return json({ error: r.reason }, { status: r.status });
  return json({ patch: r.patch, unsupported: r.unsupported, declined: r.declined });
};

export const config = { path: "/api/search/ai" };
