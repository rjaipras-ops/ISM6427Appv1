// GET /api/idx/search?q=hurricane shutters — keyword search over listing descriptions.
// Returns the ListingKeys that contain every word (prefix match) or "quoted phrase".
import { searchRemarks } from "../lib/remarks.mjs";

export default async (req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 200);
  const r = await searchRemarks(q);
  return Response.json({ q, terms: r.terms, count: r.keys.length, keys: r.keys }, { headers: { "Cache-Control": "public, max-age=120" } });
};

export const config = { path: "/api/idx/search" };
