// GET /api/idx/parcel/:key — public parcel records for a listing (Florida DOR data).
// Returns { status: "pending" } if the county server is slow; the scheduled sync
// finishes the lookup and the next request gets it.
import { getParcel } from "../lib/detail.mjs";

export default async (req, context) => {
  const key = String(context.params?.key || new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[\w-]{1,64}$/.test(key)) return Response.json({ error: "Bad listing key" }, { status: 400 });
  try {
    const r = await getParcel(key);
    return Response.json(r, { headers: { "Cache-Control": r.status === "pending" ? "no-store" : "public, max-age=3600" } });
  } catch (e) {
    console.error("[IDX] parcel error", key, e.message);
    return Response.json({ status: "error", parcel: null }, { status: 502 });
  }
};

export const config = { path: "/api/idx/parcel/:key" };
