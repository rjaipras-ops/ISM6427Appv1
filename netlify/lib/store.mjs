// Storage for the IDX cache.
//  - On Netlify: Netlify Blobs (store "idx").
//  - Locally (npm run dev / npm run idx:sync without Netlify credentials): files in .idx-cache/.
//
// Keys:
//   state            sync state (timestamps, resume cursor, counts)
//   index            compact entries for every active listing: { [ListingKey]: entry }
//   listing/<key>    full listing with photos
//   parcel/<key>     cached public-records lookup for a listing
//   reconcile-keys   keys seen during an in-progress reconcile

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";

let backendPromise;

function onNetlify() {
  return Boolean(process.env.NETLIFY_BLOBS_CONTEXT || (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN));
}

async function backend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      if (onNetlify()) {
        const { getStore } = await import("@netlify/blobs");
        const opts = { name: "idx", consistency: "strong" };
        if (!process.env.NETLIFY_BLOBS_CONTEXT) {
          opts.siteID = process.env.NETLIFY_SITE_ID;
          opts.token = process.env.NETLIFY_AUTH_TOKEN;
        }
        const s = getStore(opts);
        return {
          kind: "netlify-blobs",
          get: (k) => s.get(k, { type: "json" }),
          set: (k, v) => s.setJSON(k, v),
          del: (k) => s.delete(k),
        };
      }
      const dir = process.env.IDX_CACHE_DIR || join(process.cwd(), ".idx-cache");
      const file = (k) => join(dir, `${k.replace(/[^a-zA-Z0-9_\-/]/g, "_")}.json`);
      return {
        kind: "local-files",
        get: async (k) => { try { return JSON.parse(await readFile(file(k), "utf8")); } catch { return null; } },
        set: async (k, v) => { await mkdir(dirname(file(k)), { recursive: true }); await writeFile(file(k), JSON.stringify(v)); },
        del: async (k) => { await rm(file(k), { force: true }); },
      };
    })();
  }
  return backendPromise;
}

export async function storeKind() { return (await backend()).kind; }
export async function getJSON(key) { return (await backend()).get(key); }
export async function setJSON(key, value) { return (await backend()).set(key, value); }
export async function del(key) { return (await backend()).del(key); }

export async function getState() {
  return (await getJSON("state")) || {
    mode: null, phase: "idle", next: null, lastSyncTimestamp: null, runStartedAt: null,
    initialCompletedAt: null, lastReconcileAt: null, activeCount: 0, lastRun: null, version: 0,
  };
}
export const setState = (s) => setJSON("state", s);
export async function getIndex() { return (await getJSON("index")) || {}; }
export const setIndex = (idx) => setJSON("index", idx);
