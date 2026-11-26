// GET /api/solar/:key — rooftop solar potential for a listing (see lib/solar.mjs).
import { solarForListing } from "../lib/solar.mjs";

export default async (req, context) => {
  const key = String(context.params?.key || new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[\w-]{1,64}$/.test(key)) return Response.json({ available: false }, { status: 400 });
  try {
    const r = await solarForListing(key);
    return Response.json(r, {
      headers: r.available
        ? { "Cache-Control": "public, max-age=86400", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=604800" }
        : { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.warn("[solar]", e.message);
    return Response.json({ available: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/solar/:key" };
