// GET /sitemaps/<n>.xml — one part of the sitemap (see /sitemap.xml for the index).
import { renderSitemapPart } from "../lib/seo.mjs";

export default async (req) => {
  const n = Number((new URL(req.url).pathname.match(/\/sitemaps\/(\d+)\.xml$/) || [])[1]);
  const xml = n >= 1 ? await renderSitemapPart(n) : null;
  if (!xml) return new Response("Not found", { status: 404 });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};

export const config = { path: "/sitemaps/*" };
