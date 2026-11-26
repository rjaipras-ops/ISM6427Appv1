// GET /api/features — which optional features have their keys set in Netlify, so the page can hide
// the ones that are off (commute search: ORS_API_KEY; rooftop solar: GOOGLE_SOLAR_API_KEY).
import { commuteEnabled } from "../lib/commute.mjs";
import { solarEnabled } from "../lib/solar.mjs";

export default async () => Response.json({ commute: commuteEnabled(), solar: solarEnabled() }, {
  headers: { "Cache-Control": "public, max-age=600", "Netlify-CDN-Cache-Control": "public, s-maxage=600" },
});

export const config = { path: "/api/features" };
