// IDX sync engine.
//
// Phases (stored in the "state" blob so work resumes across runs):
//   initial    page through every active listing (first run, or after switching mock ↔ live)
//   delta      only listings modified or re-photographed since lastSyncTimestamp (5-min overlap);
//              anything no longer Active is removed immediately (off-market purge)
//   reconcile  once a day: list the keys of every active listing and remove index entries that
//              are gone (deleted, withdrawn without an update, or opted out of IDX)
//
// Each run stops before `budgetMs` (scheduled functions are cut off at 30 s) and saves a
// resume cursor; the next run continues. The index and state are saved together at the end
// of each run, so a run that's cut off just repeats a little work next time.

import { idxConfig, ACTIVE } from "./config.mjs";
import { firstPageUrl, fetchPage } from "./spark.mjs";
import { normalizeListing } from "./normalize.mjs";
import { INDEX_SCHEMA } from "./index-format.mjs";
import { getState, setState, getIndex, setIndex, getJSON, setJSON, del } from "./store.mjs";
import { toRow } from "./index-format.mjs";
import { warmParcels } from "./detail.mjs";

const OVERLAP_MS = 5 * 60 * 1000;
const SAFETY_MS = 4000;

const log = (...a) => console.log("[IDX]", ...a);

function freshState(mode) {
  return {
    mode, phase: "initial", next: null, lastSyncTimestamp: null, runStartedAt: null, schema: INDEX_SCHEMA,
    initialCompletedAt: null, lastReconcileAt: null, activeCount: 0, lastRun: null, version: 0,
  };
}

/** Is a sync due? (Always true while a multi-run phase is in progress.) */
export function isDue(state, cfg = idxConfig()) {
  if (state.mode !== (cfg.mock ? "mock" : "live")) return true;
  if (state.phase !== "idle") return true;
  if (state.schema !== INDEX_SCHEMA) return true;
  const last = Date.parse(state.lastRun?.finishedAt || 0);
  return Date.now() - last >= cfg.intervalMinutes * 60 * 1000;
}

async function removeListing(index, key) {
  if (!index[key]) return false;
  delete index[key];
  await Promise.all([del(`listing/${key}`), del(`parcel/${key}`)]);
  return true;
}

/** Runs (part of) a sync. Returns a summary of what happened. */
export async function runSync({ budgetMs, force = false, reason = "scheduled" } = {}) {
  const cfg = idxConfig();
  const mode = cfg.mock ? "mock" : "live";
  const started = Date.now();
  const hardDeadline = started + (budgetMs ?? cfg.budgetMs);
  const deadline = hardDeadline - SAFETY_MS;
  // Test mode with sample data turned off: nothing to do (the public site shows "coming soon").
  if (cfg.mock && !cfg.sampleData) return { skipped: true, reason: "feed not configured", state: await getState() };
  let state = await getState();

  if (state.mode !== mode) {
    log(`mode changed (${state.mode || "none"} → ${mode}); rebuilding the index`);
    await setIndex({});
    state = freshState(mode);
  }
  if (!force && !isDue(state, cfg)) return { skipped: true, reason: "not due", state };

  if (cfg.mock) {
    log("MOCK MODE: SPARK_API_BEARER_TOKEN is not set. Serving sample listings; no MLS data is being fetched.");
    const { mockRecords } = await import("./mock.mjs");
    const now = new Date().toISOString();
    const index = {};
    for (const rec of mockRecords()) {
      const l = normalizeListing(rec, { syncedAt: now });
      if (l && l.demo.StandardStatus === ACTIVE) index[l.ListingKey] = toRow(l);
    }
    await setIndex(index);
    state = {
      ...state, mode, phase: "idle", next: null, lastSyncTimestamp: now, initialCompletedAt: state.initialCompletedAt || now,
      lastReconcileAt: now, activeCount: Object.keys(index).length, version: (state.version || 0) + 1,
      lastRun: { startedAt: new Date(started).toISOString(), finishedAt: now, reason, phase: "mock", fetched: 0, upserted: Object.keys(index).length, removed: 0, ms: Date.now() - started, error: null },
    };
    await setState(state);
    await warmParcels(deadline).catch(() => 0);
    return { ok: true, state };
  }

  // New fields added to the index: refresh every listing (the current index stays up meanwhile).
  // (An in-progress first load restarts too, since its saved next-page links ask for the old fields.)
  if ((state.phase === "idle" || state.phase === "initial") && state.schema !== INDEX_SCHEMA && !cfg.mock) {
    log(`index schema ${state.schema || 1} → ${INDEX_SCHEMA}: refreshing all listings`);
    state.schema = INDEX_SCHEMA;
    state.phase = "initial";
    state.next = null;
    state.runStartedAt = new Date().toISOString();
  }
  // Pick the phase for this run.
  if (state.phase === "idle") {
    const reconcileDue = !state.lastReconcileAt || Date.now() - Date.parse(state.lastReconcileAt) >= cfg.reconcileHours * 3600e3;
    state.phase = state.lastSyncTimestamp ? (reconcileDue ? "reconcile" : "delta") : "initial";
    state.next = null;
    state.runStartedAt = new Date().toISOString();
    if (state.phase === "reconcile") await setJSON("reconcile-keys", []);
  }
  if (!state.runStartedAt) state.runStartedAt = new Date().toISOString();
  // Record the attempt up front, so the status page shows runs even if one is cut off.
  state.lastAttemptAt = new Date(started).toISOString();
  await setState(state);

  const index = await getIndex();
  const stats = { fetched: 0, upserted: 0, removed: 0, pages: 0 };
  let seen = state.phase === "reconcile" ? new Set((await getJSON("reconcile-keys")) || []) : null;
  let url = state.next || (
    state.phase === "initial" ? firstPageUrl("active")
    : state.phase === "delta" ? firstPageUrl("changed", { since: new Date(Date.parse(state.lastSyncTimestamp) - OVERLAP_MS).toISOString() })
    : firstPageUrl("keys")
  );
  const phase = state.phase;
  let error = null;
  let finished = false;

  try {
    while (url && Date.now() < deadline) {
      const { records, next } = await fetchPage(url, { deadline: hardDeadline });
      stats.pages++;
      stats.fetched += records.length;
      const syncedAt = new Date().toISOString();
      for (const rec of records) {
        if (phase === "reconcile") { if (rec.ListingKey) seen.add(String(rec.ListingKey)); continue; }
        const key = String(rec.ListingKey);
        const l = normalizeListing(rec, { syncedAt });
        if (l && l.demo.StandardStatus === ACTIVE) {
          index[key] = toRow(l);
          stats.upserted++;
          // Drop any cached detail so photos/price changes show on next open.
          if (phase === "delta") await del(`listing/${key}`);
        } else if (await removeListing(index, key)) {
          stats.removed++; // off-market (Pending/Closed/Withdrawn/…) or no longer displayable
        }
      }
      url = next;
      state.next = next;
    }
    finished = !url;
  } catch (e) {
    error = e.message;
    log("sync error:", e.message);
  }

  if (finished) {
    if (phase === "reconcile") {
      for (const key of Object.keys(index)) if (!seen.has(key) && (await removeListing(index, key))) stats.removed++;
      state.lastReconcileAt = new Date().toISOString();
      await del("reconcile-keys");
      // Reconcile doesn't advance lastSyncTimestamp; the next run does a delta.
    } else {
      // Everything changed up to when this phase began is now in the index.
      state.lastSyncTimestamp = state.runStartedAt;
      if (phase === "initial") { state.initialCompletedAt = new Date().toISOString(); state.lastReconcileAt = state.initialCompletedAt; }
    }
    state.phase = "idle";
    state.next = null;
    state.runStartedAt = null;
  } else if (phase === "reconcile") {
    await setJSON("reconcile-keys", [...seen]);
  }

  state.activeCount = Object.keys(index).length;
  if (stats.upserted || stats.removed || finished) state.version = (state.version || 0) + 1;
  state.lastRun = {
    startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), reason, phase,
    completedPhase: finished, ...stats, ms: Date.now() - started, error,
  };
  await setIndex(index);
  await setState(state);
  // Spare time: look up public records that were too slow to load on request.
  const warmed = await warmParcels(deadline).catch(() => 0);
  if (warmed) log(`public records cached for ${warmed} queued listing(s)`);
  log(`${phase}${finished ? " complete" : " (continuing next run)"}: ${stats.pages} pages, +${stats.upserted} / -${stats.removed}, ${state.activeCount} active${error ? `, error: ${error}` : ""}`);
  return { ok: !error, finished, state };
}

/** Public status (safe to expose). */
export async function syncStatus() {
  const cfg = idxConfig();
  const state = await getState();
  if (cfg.mock && !cfg.sampleData) return { mode: "pending", lastSyncTimestamp: null, activeListings: 0, phase: "idle", version: 0, intervalMinutes: cfg.intervalMinutes };
  const current = state.mode === (cfg.mock ? "mock" : "live");
  return {
    mode: cfg.mock ? "mock" : "live",
    lastSyncTimestamp: current ? state.lastSyncTimestamp : null,
    activeListings: current ? state.activeCount || 0 : 0,
    phase: state.phase,
    version: state.version || 0,
    intervalMinutes: cfg.intervalMinutes,
    lastReconcileAt: state.lastReconcileAt,
    lastAttemptAt: state.lastAttemptAt || null,
    lastRun: state.lastRun && {
      startedAt: state.lastRun.startedAt, finishedAt: state.lastRun.finishedAt, phase: state.lastRun.phase,
      completedPhase: state.lastRun.completedPhase, upserted: state.lastRun.upserted, removed: state.lastRun.removed,
      error: state.lastRun.error ? String(state.lastRun.error).replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 200) : null,
    },
  };
}
