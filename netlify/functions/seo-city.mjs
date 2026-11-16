// GET /fl and /fl/<city> — indexable city pages (see netlify/lib/seo.mjs).
import { renderCityIndex, renderCityPage } from "../lib/seo.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400" };
  const m = u.pathname.match(/^\/fl(?:\/([a-z0-9-]+))?\/?$/);
  if (!m) return new Response("Not found", { status: 404 });
  if (u.pathname.endsWith("/")) return Response.redirect(new URL(u.pathname.replace(/\/+$/, ""), u.origin).toString(), 301);
  const html = m[1] ? await renderCityPage(m[1]) : await renderCityIndex();
  if (!html) return Response.redirect(new URL("/fl", u.origin).toString(), 302);
  return new Response(html, { headers });
};

export const config = { path: ["/fl", "/fl/*"] };
