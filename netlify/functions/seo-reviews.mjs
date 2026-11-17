// GET /reviews/<home> — permanent tour-review page for a home that isn't listed right now (see lib/seo.mjs).
import { renderHomeReviewsPage } from "../lib/seo.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const m = u.pathname.match(/^\/reviews\/([a-z0-9-]{6,120})\/?$/);
  const r = m ? await renderHomeReviewsPage(m[1]) : null;
  if (!r) return Response.redirect(new URL("/", u.origin).toString(), 302);
  if (r.redirect) return Response.redirect(new URL(r.redirect, u.origin).toString(), 302); // listed again: send to the listing
  return new Response(r.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600",
    "Netlify-CDN-Cache-Control": "public, durable, s-maxage=1800, stale-while-revalidate=86400" } });
};

export const config = { path: "/reviews/*" };
