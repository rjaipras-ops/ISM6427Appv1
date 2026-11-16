// GET /robots.txt — points crawlers at the sitemap on whatever the site's main domain is.
import { siteUrl } from "../lib/seo.mjs";

export default async () => new Response(
  `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl()}/sitemap.xml\n`,
  { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400" } },
);

export const config = { path: "/robots.txt" };
