// GET /api/idx/listings — compact index of every active listing (map, cards, filters).
// Gzip-compressed, with an ETag so browsers re-download only after a sync changes it.
import { gzipSync } from "node:zlib";
import { getIndex, getState } from "../lib/store.mjs";
import { runSync } from "../lib/sync.mjs";
import { idxConfig } from "../lib/config.mjs";
import { INDEX_FIELDS, INDEX_FLAGS } from "../lib/index-format.mjs";

export default async (req) => {
  const cfg = idxConfig();
  let state = await getState();
  // Test mode builds its sample index instantly on first request.
  if (cfg.mock && (state.mode !== "mock" || !state.lastSyncTimestamp)) state = (await runSync({ force: true, reason: "first request" })).state;

  const etag = `"${state.mode}-${state.version || 0}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const index = await getIndex();
  const body = JSON.stringify({
    mode: cfg.mock ? "mock" : "live",
    lastSyncTimestamp: state.lastSyncTimestamp,
    version: state.version || 0,
    count: Object.keys(index).length,
    fields: [...INDEX_FIELDS, "_flags"],
    flags: INDEX_FLAGS,
    rows: Object.values(index),
  });
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ETag: etag };
  if (/\bgzip\b/.test(req.headers.get("accept-encoding") || "")) {
    return new Response(gzipSync(body), { headers: { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" } });
  }
  return new Response(body, { headers });
};

export const config = { path: "/api/idx/listings" };
