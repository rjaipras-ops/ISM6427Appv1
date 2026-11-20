// GET /api/idx/search?q=hurricane shutters — keyword search over listing descriptions.
// Returns the ListingKeys that contain every word (prefix match) or "quoted phrase".
// With &any=1, q is a list of phrases separated by "|" and a description needs only one of them.
import { searchRemarks, searchRemarksAny } from "../lib/remarks.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") || "").slice(0, u.searchParams.get("any") ? 1200 : 200);
  const r = u.searchParams.get("any") ? await searchRemarksAny(q.split("|")) : await searchRemarks(q);
  return Response.json({ q, terms: r.terms, count: r.keys.length, keys: r.keys }, { headers: { "Cache-Control": "public, max-age=120" } });
};

export const config = { path: "/api/idx/search" };
