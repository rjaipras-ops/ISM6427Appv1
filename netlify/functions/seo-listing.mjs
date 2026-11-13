// GET /homes/<ListingKey>-<slug> — indexable listing page (see netlify/lib/seo.mjs).
import { findListing, listingPath, renderListingPage, renderGonePage, siteUrl } from "../lib/seo.mjs";

let shell = { at: 0, html: null };
async function appShell(req) {
  if (shell.html && Date.now() - shell.at < 10 * 60e3) return shell.html;
  const res = await fetch(new URL("/index.html", req.url));
  shell = { at: Date.now(), html: await res.text() };
  return shell.html;
}

export default async (req) => {
  const u = new URL(req.url);
  const m = u.pathname.match(/^\/homes\/([0-9A-Za-z]+)(?:-[a-z0-9-]*)?\/?$/);
  const html = await appShell(req);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" };
  if (!m) return new Response(renderGonePage(html), { status: 404, headers });
  const l = await findListing(m[1]);
  if (!l) return new Response(renderGonePage(html), { status: 410, headers });
  const path = listingPath(l);
  // One address per listing: send old or partial slugs to the current one.
  if (u.pathname !== path) return Response.redirect(new URL(path, u.origin).toString(), 301);
  return new Response(renderListingPage(html, l, { canonical: siteUrl() + path }), { headers });
};

export const config = { path: "/homes/*" };
