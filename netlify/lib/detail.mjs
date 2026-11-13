// Full details for one listing (remarks, every photo, office contact), fetched from
// Spark when a listing is opened and cached for one sync interval, so photos and
// details on the listing page are always current. Public parcel records are looked
// up separately (getParcel) because the state parcel server can take 20+ seconds.

import { idxConfig, ACTIVE } from "./config.mjs";
import { sparkGet, RESO_SELECT, qs } from "./spark.mjs";
import { normalizeListing } from "./normalize.mjs";
import { getJSON, setJSON, del, getIndex, setIndex, getState, setState } from "./store.mjs";
import { lookupParcel } from "./parcels.mjs";
import { INDEX_FIELDS } from "./index-format.mjs";

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function fetchRecord(key) {
  const cfg = idxConfig();
  if (cfg.mock) {
    if (!cfg.sampleData) return null;
    const { mockRecords } = await import("./mock.mjs");
    return mockRecords().find((r) => r.ListingKey === key) || null;
  }
  try {
    if (cfg.flavor === "reso") {
      return await sparkGet(`${cfg.baseUrl}/Property('${encodeURIComponent(key)}')?${qs({ $select: RESO_SELECT.join(","), $expand: "Media" })}`);
    }
    const json = await sparkGet(`${cfg.baseUrl}/listings/${encodeURIComponent(key)}?_expand=PrimaryPhoto,Photos`);
    const r = (json.D || json.d)?.Results?.[0];
    return r ? { ...r.StandardFields, ListingKey: r.StandardFields?.ListingKey || r.Id } : null;
  } catch (e) {
    if (/Spark API 404/.test(e.message)) return null;
    throw e;
  }
}

/** Removes a listing that is no longer active/displayable from the index right away. */
async function purge(key) {
  const index = await getIndex();
  if (!index[key]) return;
  delete index[key];
  await setIndex(index);
  const state = await getState();
  state.activeCount = Object.keys(index).length;
  state.version = (state.version || 0) + 1;
  await setState(state);
  await Promise.all([del(`listing/${key}`), del(`parcel/${key}`)]);
}

/* ---------- public records (looked up separately; the county server can be slow) ---------- */

const QUEUE = "parcel-queue";

async function listingFromIndex(key) {
  const row = (await getIndex())[key];
  if (!row) return null;
  const o = Object.fromEntries(INDEX_FIELDS.map((f, i) => [f, row[i]]));
  return { ListingKey: key, StreetAddress: o.StreetAddress, UnitNumber: null, PostalCode: o.PostalCode,
    Longitude: o.Longitude, Latitude: o.Latitude, County: o.County, ListPrice: o.ListPrice };
}

async function lookupAndCache(listing, ms) {
  // Owner name stays off MLS listings (BeachesMLS rule 20.3.8) unless explicitly allowed.
  const includeOwner = process.env.IDX_SHOW_OWNER === "true";
  const r = await withTimeout(lookupParcel(listing, { includeOwner }), ms);
  const entry = { at: new Date().toISOString(), status: r.status, parcel: r.parcel };
  await setJSON(`parcel/${listing.ListingKey}`, entry);
  return entry;
}

/** Returns { status: "matched" | "no_match" | "ambiguous" | "unit_not_found" | "pending", parcel }. */
export async function getParcel(key) {
  const cached = await getJSON(`parcel/${key}`);
  if (cached) return { status: cached.status, parcel: cached.parcel };
  const listing = await listingFromIndex(key);
  if (!listing) return { status: "gone", parcel: null };
  try {
    return await lookupAndCache(listing, 8000);
  } catch {
    // Too slow right now: queue it for the next scheduled sync run.
    const q = (await getJSON(QUEUE)) || [];
    if (!q.includes(key)) { q.push(key); await setJSON(QUEUE, q.slice(-500)); }
    return { status: "pending", parcel: null };
  }
}

/** Called by the sync with leftover time: look up queued parcels. */
export async function warmParcels(deadline) {
  const q = (await getJSON(QUEUE)) || [];
  if (!q.length) return 0;
  let done = 0;
  while (q.length && Date.now() < deadline - 2000) {
    const key = q[0];
    const listing = await listingFromIndex(key);
    try {
      if (listing && !(await getJSON(`parcel/${key}`))) await lookupAndCache(listing, Math.max(1000, deadline - Date.now() - 1000));
      q.shift();
      done++;
    } catch {
      break; // still slow; keep it queued
    }
  }
  await setJSON(QUEUE, q);
  return done;
}

/** Returns { listing } or { gone: true }. */
export async function getListingDetail(key) {
  const cfg = idxConfig();
  const cached = await getJSON(`listing/${key}`);
  let listing = cached && Date.now() - Date.parse(cached.fetchedAt) < cfg.intervalMinutes * 60e3 ? cached.listing : null;
  if (!listing) {
    const rec = await fetchRecord(key);
    listing = rec ? normalizeListing(rec, { syncedAt: new Date().toISOString() }) : null;
    if (!listing || listing.demo.StandardStatus !== ACTIVE) {
      await purge(key);
      return { gone: true };
    }
    await setJSON(`listing/${key}`, { fetchedAt: new Date().toISOString(), listing });
  }
  return { listing };
}
