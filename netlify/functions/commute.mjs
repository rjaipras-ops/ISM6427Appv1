// GET /api/commute?q=Brickell%20City%20Centre&min=30&mode=drive — area reachable within the time
// (see lib/commute.mjs).
import { commuteArea } from "../lib/commute.mjs";

export default async (req) => {
  const u = new URL(req.url);
  try {
    const r = await commuteArea(u.searchParams.get("q"), u.searchParams.get("min"), u.searchParams.get("mode"));
    return Response.json(r, {
      status: r.error ? (r.error === "off" ? 404 : 400) : 200,
      headers: r.error ? { "Cache-Control": "no-store" } : { "Cache-Control": "public, max-age=86400", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=604800" },
    });
  } catch (e) {
    console.warn("[commute]", e.message);
    return Response.json({ error: "The travel-time service didn't answer. Please try again." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/commute" };
