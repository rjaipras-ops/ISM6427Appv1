// GET /api/idx/listings — compact index of every active listing (map, cards, filters).
// Gzip-compressed, with an ETag so browsers re-download only after a sync changes it.
import { gzipSync } from "node:zlib";
import { getIndex, getState } from "../lib/store.mjs";
import { runSync } from "../lib/sync.mjs";
import { idxConfig } from "../lib/config.mjs";
import { INDEX_FIELDS, INDEX_FLAGS } from "../lib/index-format.mjs";

const PHOTO_PREFIX = "https://cdn.photos.sparkplatform.com/";
const PHOTO_COL = INDEX_FIELDS.indexOf("primaryPhotoUrl");
// Stream large bodies: buffered function responses are capped at 6 MB.
const stream = (buf) => new ReadableStream({ start(c) { for (let i = 0; i < buf.length; i += 1 << 20) c.enqueue(buf.subarray(i, i + (1 << 20))); c.close(); } });

let bodyMemo = null; // { etag, json, gz } for the current sync version (reused while this instance is warm)

export default async (req) => {
  const cfg = idxConfig();
  // Before the feed is live, the public site shows no listings at all ("pending").
  if (cfg.mock && !cfg.sampleData) {
    return Response.json({ mode: "pending", lastSyncTimestamp: null, version: 0, count: 0, fields: [...INDEX_FIELDS, "_flags"], flags: INDEX_FLAGS, rows: [] },
      { headers: { "Cache-Control": "no-cache" } });
  }
  let state = await getState();
  // Test mode builds its sample index instantly on first request.
  if (cfg.mock && (state.mode !== "mock" || !state.lastSyncTimestamp)) state = (await runSync({ force: true, reason: "first request" })).state;

  const etag = `"${state.mode}-${state.version || 0}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  // Index left over from a different mode (e.g. samples from before the feed key was added):
  // don't show it; the first live sync replaces it within a few minutes.
  const current = state.mode === (cfg.mock ? "mock" : "live");
  const gzipOk = /\bgzip\b/.test(req.headers.get("accept-encoding") || "");
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ETag: etag,
    // Netlify's CDN keeps a copy for a few minutes, so most visitors never start this function.
    "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=600", Vary: "Accept-Encoding" };
  if (bodyMemo?.etag === etag) {
    return gzipOk ? new Response(stream(bodyMemo.gz), { headers: { ...headers, "Content-Encoding": "gzip" } }) : new Response(stream(bodyMemo.json), { headers });
  }
  const index = current ? await getIndex() : {};
  const body = JSON.stringify({
    mode: cfg.mock ? "mock" : "live",
    lastSyncTimestamp: current ? state.lastSyncTimestamp : null,
    version: state.version || 0,
    count: Object.keys(index).length,
    fields: [...INDEX_FIELDS, "_flags"],
    flags: INDEX_FLAGS,
    // Photo URLs share a long prefix; send "~" instead (js/store.js expands it).
    photoPrefix: PHOTO_PREFIX,
    rows: Object.values(index).map((r) => {
      const i = PHOTO_COL;
      return typeof r[i] === "string" && r[i].startsWith(PHOTO_PREFIX) ? [...r.slice(0, i), "~" + r[i].slice(PHOTO_PREFIX.length), ...r.slice(i + 1)] : r;
    }),
  });
  bodyMemo = { etag, json: Buffer.from(body), gz: gzipSync(body) };
  if (gzipOk) return new Response(stream(bodyMemo.gz), { headers: { ...headers, "Content-Encoding": "gzip" } });
  return new Response(stream(bodyMemo.json), { headers });
};

export const config = { path: "/api/idx/listings" };
