// POST /api/insights — the browser reports a search or a home view (anonymous; see lib/insights.mjs).
import { record } from "../lib/insights.mjs";
import { sameOrigin } from "../lib/auth.mjs";

export default async (req) => {
  if (req.method !== "POST" || !sameOrigin(req)) return new Response(null, { status: 204 });
  const body = await req.json().catch(() => null);
  await record(body, { userAgent: req.headers.get("user-agent") || "" }).catch(() => {});
  return new Response(null, { status: 204 });
};

export const config = { path: "/api/insights" };
