// GET /api/elevation?lat=26.12&lng=-80.14 — ground elevation for a listing (see lib/elevation.mjs).
import { elevationAt, inFlorida } from "../lib/elevation.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inFlorida(lat, lng)) return Response.json({ error: "Florida coordinates only" }, { status: 400 });
  const r = await elevationAt(lat, lng);
  if (!r) return Response.json({ elevation: null }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ elevation: r }, {
    headers: { "Cache-Control": "public, max-age=86400", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=2592000" },
  });
};

export const config = { path: "/api/elevation" };
