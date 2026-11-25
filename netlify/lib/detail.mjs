// Full details for one listing (remarks, every photo, office contact), fetched from
// Spark when a listing is opened and cached for one sync interval, so photos and
// details on the listing page are always current. Public parcel records are looked
// up separately (getParcel) because the state parcel server can take 20+ seconds.

import { idxConfig, ACTIVE } from "./config.mjs";
import { sparkGet, RESO_SELECT, qs } from "./spark.mjs";
import { normalizeListing } from "./normalize.mjs";
import { getJSON, setJSON, del, getIndex, setIndex, getState, setState, readIndex } from "./store.mjs";
import { lookupParcel } from "./parcels.mjs";
import { INDEX_FIELDS, INDEX_FLAGS } from "./index-format.mjs";

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// Structure details shown on the listing page (standard RESO fields; skipped if the feed lacks them).
const DETAIL_EXTRA = ["Roof", "FoundationDetails", "WindowFeatures"];
let extrasOffUntil = 0;

async function fetchRecord(key) {
  const cfg = idxConfig();
  if (cfg.mock) {
    if (!cfg.sampleData) return null;
    const { mockRecords } = await import("./mock.mjs");
    return mockRecords().find((r) => r.ListingKey === key) || null;
  }
  try {
    if (cfg.flavor === "reso") {
      const get = (fields) => sparkGet(`${cfg.baseUrl}/Property('${encodeURIComponent(key)}')?${qs({ $select: fields.join(","), $expand: "Media" })}`);
      if (Date.now() > extrasOffUntil) {
        try { return await get([...RESO_SELECT, ...DETAIL_EXTRA]); } catch (e) {
          if (!/Spark API 400/.test(e.message)) throw e;
          extrasOffUntil = Date.now() + 6 * 3600e3; // the feed doesn't know one of the extra fields
          console.warn("[detail] extra structure fields not available:", e.message.slice(0, 160));
        }
      }
      return await get(RESO_SELECT);
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

// Bump when the parcel matcher improves, so earlier results (matches included) are redone once.
// 3: uses the MLS parcel number (exact condo unit), so earlier wrong-unit matches are corrected.
const MATCH_VERSION = 3;

async function listingFromIndex(key, { fetchDetail = true } = {}) {
  const row = (await readIndex())[key];
  if (!row) return null;
  const o = Object.fromEntries(INDEX_FIELDS.map((f, i) => [f, row[i]]));
  const flags = Number(row[INDEX_FIELDS.length]) || 0;
  const base = { ListingKey: key, StreetAddress: o.StreetAddress, UnitNumber: null, ParcelNumber: null, PostalCode: o.PostalCode,
    Longitude: o.Longitude, Latitude: o.Latitude, County: o.County, ListPrice: o.ListPrice, AddressHidden: !!(flags & (1 << INDEX_FLAGS.indexOf("AddressHidden"))) };
  // The unit and the MLS parcel number come from the full listing (cached when its page opens).
  // (The scheduled sync uses only what's cached, so it never waits on the MLS.)
  try {
    const d = fetchDetail ? await withTimeout(getListingDetail(key), 4000) : { listing: (await getJSON(`listing/${key}`))?.listing };
    if (d.listing) Object.assign(base, { UnitNumber: d.listing.UnitNumber || null, ParcelNumber: d.listing.ParcelNumber || null });
  } catch { /* slow or unavailable: match by location and address */ }
  return base;
}

async function lookupAndCache(listing, ms) {
  // Owner name stays off MLS listings (BeachesMLS rule 20.3.8) unless explicitly allowed.
  const includeOwner = process.env.IDX_SHOW_OWNER === "true";
  const r = await withTimeout(lookupParcel(listing, { includeOwner }), ms);
  const entry = { at: new Date().toISOString(), v: MATCH_VERSION, status: r.status, parcel: r.parcel };
  await setJSON(`parcel/${listing.ListingKey}`, entry);
  return entry;
}

/** Returns { status: "matched" | "no_match" | "ambiguous" | "unit_not_found" | "pending", parcel }. */
export async function getParcel(key) {
  const cached = await getJSON(`parcel/${key}`);
  // Keep matches; retry failures made by an older matcher or more than a week ago.
  const fresh = cached && cached.v === MATCH_VERSION && (cached.status === "matched" || Date.now() - Date.parse(cached.at) < 7 * 864e5);
  if (fresh) return { status: cached.status, parcel: cached.parcel };
  const listing = await listingFromIndex(key);
  if (!listing) return { status: "gone", parcel: null };
  // The seller chose not to show the address: county record links would reveal it.
  if (listing.AddressHidden) return { status: "no_match", parcel: null };
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
    const listing = await listingFromIndex(key, { fetchDetail: false });
    try {
      if (listing && !listing.AddressHidden && !(await getJSON(`parcel/${key}`))) await lookupAndCache(listing, Math.max(1000, deadline - Date.now() - 1000));
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
