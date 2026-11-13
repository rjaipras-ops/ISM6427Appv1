// GET /sitemap.xml — every displayable listing page plus the main pages.
import { renderSitemap } from "../lib/seo.mjs";

export default async () => new Response(await renderSitemap(), {
  headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
});

export const config = { path: "/sitemap.xml" };
