// Keyword search over listing descriptions (like Zillow's "Keywords" filter).
//
// Descriptions are too big to send to every browser (~29k listings ≈ 20 MB), so they stay on the
// server. The sync stores them in shards keyed by the listing's creation month (ListingKey starts
// with YYYYMM), so a sync run only rewrites the shards it touched. Searching loads every shard once
// per function instance (then keeps them in memory until the feed changes) and returns matching keys.

import { getJSON, setJSON, getState } from "./store.mjs";

const LIST_KEY = "remarks/shards";
const shardOf = (key) => (/^\d{6}/.test(key) ? key.slice(0, 6) : "misc");
const shardKey = (s) => `remarks/${s}`;

/** Lowercase words separated by single spaces, padded so " word" prefix matching works. */
export const normalizeText = (s) => ` ${String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Collects description changes during a sync run and writes only the shards that changed. */
export class RemarksWriter {
  constructor() { this.shards = new Map(); this.dirty = new Set(); this.names = null; }
  async #shard(name) {
    if (!this.shards.has(name)) this.shards.set(name, (await getJSON(shardKey(name))) || {});
    return this.shards.get(name);
  }
  async set(key, text) {
    const name = shardOf(key);
    const s = await this.#shard(name);
    const t = normalizeText(text).slice(0, 4000);
    if (s[key] !== t) { s[key] = t; this.dirty.add(name); }
  }
  async remove(key) {
    const name = shardOf(key);
    const s = await this.#shard(name);
    if (key in s) { delete s[key]; this.dirty.add(name); }
  }
  async flush() {
    if (!this.dirty.size) return 0;
    const names = new Set((await getJSON(LIST_KEY)) || []);
    const dirty = [...this.dirty];
    for (let i = 0; i < dirty.length; i += 16) {
      await Promise.all(dirty.slice(i, i + 16).map((n) => setJSON(shardKey(n), this.shards.get(n))));
    }
    dirty.forEach((n) => names.add(n));
    await setJSON(LIST_KEY, [...names].sort());
    this.dirty.clear();
    return dirty.length;
  }
}

/* ---------------- search ---------------- */
let cache = { version: -1, at: 0, entries: null };

async function loadAll() {
  const state = await getState();
  if (cache.entries && cache.version === state.version && Date.now() - cache.at < 15 * 60e3) return cache.entries;
  const names = (await getJSON(LIST_KEY)) || [];
  const entries = [];
  for (let i = 0; i < names.length; i += 24) {
    const shards = await Promise.all(names.slice(i, i + 24).map((n) => getJSON(shardKey(n))));
    for (const s of shards) if (s) for (const [k, t] of Object.entries(s)) entries.push([k, t]);
  }
  cache = { version: state.version, at: Date.now(), entries };
  return entries;
}

/** Splits a query into terms; "quoted phrases" stay together. Words match as prefixes ("shutter" finds "shutters"). */
export function parseQuery(q) {
  const terms = [];
  String(q || "").replace(/"([^"]+)"|(\S+)/g, (_, phrase, word) => {
    const t = normalizeText(phrase || word).trim();
    if (t) terms.push(` ${t}`);
    return "";
  });
  return terms.slice(0, 8);
}

/** Returns the ListingKeys whose description contains every term. */
export async function searchRemarks(q) {
  const terms = parseQuery(q);
  if (!terms.length) return { keys: [], terms: [] };
  const entries = await loadAll();
  const keys = [];
  for (const [k, t] of entries) if (terms.every((term) => t.includes(term))) keys.push(k);
  return { keys, terms: terms.map((t) => t.trim()), searched: entries.length };
}
