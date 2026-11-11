// GET /api/property/lookup?address=...[&parcel=P-16-...]
// Public records for any home in Broward, Palm Beach or St. Lucie, found by address.
// Used by the Toured panel on the MLS Search page.
import { createHash } from "node:crypto";
import { lookupProperty } from "../lib/property.mjs";
import { getJSON, setJSON } from "../lib/store.mjs";

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export default async (req) => {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").trim().slice(0, 200);
  const parcelKey = (url.searchParams.get("parcel") || "").trim();
  if (!address) return Response.json({ status: "not_found", message: "Enter an address." }, { status: 400 });
  if (parcelKey && !/^P-\d+-[A-Za-z0-9]+$/.test(parcelKey)) return Response.json({ error: "Bad parcel key" }, { status: 400 });

  const cacheKey = `property-lookup/${createHash("sha1").update(`${address.toUpperCase()}|${parcelKey}`).digest("hex")}`;
  const cached = await getJSON(cacheKey);
  if (cached && Date.now() - Date.parse(cached.at) < 7 * 864e5) return Response.json(cached.result, { headers: { "Cache-Control": "public, max-age=3600" } });

  try {
    // Netlify stops functions at ~10 s; the county parcel server is sometimes slow.
    const result = await withTimeout(lookupProperty({ address, parcelKey }), 9000);
    if (result.status === "matched" || result.status === "choose_unit") await setJSON(cacheKey, { at: new Date().toISOString(), result });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    if (e.message === "timeout") return Response.json({ status: "slow", message: "County records are slow right now. Trying again…" }, { status: 503 });
    console.error("[property] lookup error", e.message);
    return Response.json({ status: "error", message: "Lookup is temporarily unavailable. Please try again." }, { status: 502 });
  }
};

export const config = { path: "/api/property/lookup" };
