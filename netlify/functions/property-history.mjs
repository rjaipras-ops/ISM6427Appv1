// GET /api/property/history?county=Broward&parcel=484203G60340 — sale history and actual tax bill
// from the county property appraiser (Broward, Palm Beach). No owner names.
import { getHistory } from "../lib/history.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const county = u.searchParams.get("county") || "";
  if (!["Broward", "Palm Beach", "St. Lucie"].includes(county)) return Response.json({ error: "Unknown county" }, { status: 400 });
  const r = await getHistory(county, u.searchParams.get("parcel"));
  if (r.status === "bad_request") return Response.json({ error: "Bad parcel number" }, { status: 400 });
  return Response.json(r, { headers: { "Cache-Control": "public, max-age=3600" } });
};

export const config = { path: "/api/property/history" };
