// GET /api/idx/listing/:key — one listing with all photos, remarks, office contact
// and public records. 410 if it's no longer active (it's also removed from the index).
import { getListingDetail } from "../lib/detail.mjs";

export default async (req, context) => {
  const key = String(context.params?.key || new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[\w-]{1,64}$/.test(key)) return Response.json({ error: "Bad listing key" }, { status: 400 });
  try {
    const r = await getListingDetail(key);
    if (r.gone) return Response.json({ gone: true }, { status: 410, headers: { "Cache-Control": "no-store" } });
    return Response.json(r.listing, { headers: { "Cache-Control": "no-cache" } });
  } catch (e) {
    console.error("[IDX] detail error", key, e.message);
    return Response.json({ error: "Listing details are temporarily unavailable." }, { status: 502 });
  }
};

export const config = { path: "/api/idx/listing/:key" };
