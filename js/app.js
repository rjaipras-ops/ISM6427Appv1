import * as store from "./store.js";
import {
  PRICE_STEPS, SQFT_STEPS, LOT_STEPS, LOT_LABELS, HOME_TYPES, SEGMENTS, DRAWER_KEYS,
  defaults, matches, sortListings, toQuery, fromQuery, chipsFor, shortMoney,
} from "./filters.js";
import { monthlyCost, parseMoney } from "./payment.js";
import { taxBillLink, formatPcn } from "./taxlinks.js";
import { buildRanges, syncRanges, wireRanges } from "./ranges.js";
import { taxEstimates } from "./taxes.js";
import { houseSVG, typeIcon } from "./art.js";
import { SITE } from "./config.js";
import { satelliteThumb, satelliteMap, addParcelOutline } from "./imagery.js";
import { carouselHTML, initCarousel, openLightbox } from "./gallery.js";

/* ---------------- helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt$ = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmtN = (n) => Math.round(n).toLocaleString("en-US");
const fmtDate = (iso) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const weekday = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const stars = (v, size = "") => {
  const full = Math.round(v * 2) / 2;
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= full ? "★" : (i - 0.5 === full ? "★" : `<span class="off">★</span>`);
  return `<span class="stars ${size}" aria-label="${v.toFixed(1)} out of 5 stars">${s}</span>`;
};
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}
const HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="#1b2228" stroke-width="2" stroke-linejoin="round"/></svg>`;
const CHECK = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------------- state ---------------- */
const S = {
  listings: [],
  byId: new Map(),
  f: fromQuery(location.search),
  summaries: store.getReviewSummaries(),
  saved: store.getSaved(),
  user: store.getUser(),
  results: [],
  // Where listings came from: "live" (BeachesMLS feed), "mock" (test mode), "demo" (static file).
  feed: { mode: "demo", lastSyncTimestamp: null, version: 0 },
  // Details loaded per MLS listing (photos, remarks, office contact, public records).
  details: new Map(),
};

/* ---------------- boot ---------------- */
init().catch((e) => {
  console.error(e);
  $("#cards").innerHTML = `<div class="empty"><h2>Couldn't load listings</h2><p>${esc(e.message)}. If you opened index.html directly, serve the folder instead (e.g. <code>npx serve .</code>).</p></div>`;
});

async function init() {
  const [feed] = await Promise.all([store.loadFeed(), store.initBackend()]);
  S.user = store.getUser();
  S.summaries = store.getReviewSummaries();
  applyFeed(feed);
  buildControls();
  initMap();
  renderAccount();
  renderBrokerage();
  store.onAuthChange((u) => { S.user = u; renderAccount(); route(); });
  wireEvents();
  syncControls();
  observeSearchbar();
  window.addEventListener("hashchange", route);
  route();
  startBackgroundRefresh();
}

// Agent contact helpers: phone/email are optional in config.js.
const phoneLink = () => (SITE.phone ? ` · <a href="tel:${esc(SITE.phone.replace(/[^0-9+]/g, ""))}">${esc(SITE.phone)}</a>` : "");
// Tour requests are posted to Netlify Forms, which emails them to the agent. The agent's email
// address is set in Netlify (Forms → notifications) and never appears in the site's code.
function contactAgent(subject, message, home = "") {
  const dlg = $("#contactModal");
  const f = $("#contactForm");
  f.reset();
  $("#contactTitle").textContent = home ? "Request a tour" : "Contact us";
  $("#agentNote").hidden = true;
  f.subject.value = subject;
  f.home.value = home;
  f.message.value = message;
  const u = store.getUser?.();
  if (u) { f.name.value = u.displayName || ""; f.email.value = u.email || ""; }
  $("#contactStatus").textContent = "";
  dlg.showModal();
}
async function submitContact(e) {
  e.preventDefault();
  const f = e.target;
  if (!f.reportValidity()) return;
  const btn = f.querySelector("[type=submit]");
  btn.disabled = true;
  $("#contactStatus").textContent = "Sending…";
  try {
    // Someone who already has an agent shouldn't be referred to another one.
    if (f.has_agent.value === "Yes") { $("#agentNote").hidden = false; btn.disabled = false; $("#contactStatus").textContent = ""; return; }
    f.page.value = location.href;
    f.consent_text.value = `${$("#consentText").textContent.trim()} ${$("#feeText").textContent.trim()}`;
    f.consent_version.value = "2026-11-13";
    f.consent_at.value = new Date().toISOString();
    const data = new URLSearchParams(new FormData(f));
    const res = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: data.toString(), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(res.status);
    $("#contactModal").close();
    toast("Thanks! A local agent will be in touch soon.");
  } catch {
    $("#contactStatus").textContent = "Sorry, that didn't send. Please try again in a moment.";
  } finally { btn.disabled = false; }
}

// BeachesMLS rule 20.2.5: the site must clearly identify the brokerage, visible on arrival.
function renderBrokerage() {
  const el = $("#brokerage");
  if (!el) return;
  el.innerHTML = `<span class="broker-agent">${esc(SITE.agentName)}<span class="broker-lic"> · Lic. ${esc(SITE.licenseNo)}</span></span><span class="broker-firm">${esc(SITE.brokerage)}</span>`;
  el.title = [`${SITE.agentName}, ${SITE.brokerage}`, SITE.phone].filter(Boolean).join(" · ");
  el.onclick = () => {
    $("#aboutTitle").textContent = SITE.agentName;
    $(".about-firm").innerHTML = `${esc(SITE.brokerage)} · Florida real estate license ${esc(SITE.licenseNo)}${SITE.phone ? `<br>${phoneLink().replace(/^ · /, "")}` : ""}`;
    $("#aboutModal").showModal();
  };
  $("#aboutContact").onclick = () => { $("#aboutModal").close(); contactAgent("Message from Toured", "", ""); };
}

/* ---------------- feed (BeachesMLS IDX) ---------------- */
function applyFeed(feed) {
  S.feed = { mode: feed.mode, lastSyncTimestamp: feed.lastSyncTimestamp, version: feed.version };
  S.listings = feed.listings;
  S.byId = new Map(S.listings.map((l) => [l.ListingId, l]));
  renderFeedBanner();
  renderFooter();
}
const isMls = (l) => l?.Source === "mls";
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
function ago(iso) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : fmtDateTime(iso);
}
// BeachesMLS logo (required on IDX listings). Text mark until the official logo file is configured.
function mlsMark() {
  return SITE.mlsLogo
    ? `<img class="mls-logo" src="${esc(SITE.mlsLogo)}" alt="BeachesMLS">`
    : `<span class="mls-mark" title="Listing provided by BeachesMLS">BMLS</span>`;
}
function renderFeedBanner() {
  const el = $("#feedBanner");
  if (!el) return;
  const m = S.feed.mode;
  el.hidden = false;
  el.className = `feed-banner feed-${m}`;
  el.innerHTML = m === "live" && !S.feed.lastSyncTimestamp
    ? `${mlsMark()} <span>Loading listings… ${S.listings.length.toLocaleString()} so far</span>`
    : m === "live"
    ? `${mlsMark()} <span>Updated <b class="feed-updated" title="Listings from BeachesMLS, last synced ${esc(fmtDateTime(S.feed.lastSyncTimestamp))}">${esc(ago(S.feed.lastSyncTimestamp))}</b></span>`
    : m === "mock"
      ? `<b>Sample data (test mode).</b> <span>These sample listings use satellite images in place of photos. Real BeachesMLS listings and photos appear automatically once the feed key is configured.</span>`
      : m === "pending"
        ? `<span>Live BeachesMLS listings are coming soon. <a href="#/mls-search">Search all listings now</a>.</span>`
        : `<b>Demo data.</b> <span>Not a live listing service.</span>`;
}
function renderFooter() {
  const mls = S.feed.mode === "live" || S.feed.mode === "mock";
  $("#agentFoot").innerHTML = `<b>${esc(SITE.agentName)}</b>, ${esc(SITE.brokerage)}${SITE.phone ? ` · ${esc(SITE.phone)}` : ""} · Lic. ${esc(SITE.licenseNo)}` +
    (mls ? `<span class="idx-disclaimer">${mlsMark()} ${esc(SITE.mlsDisclaimer())}</span>` : "");
  $("#globalFoot").innerHTML = `<p><b>${esc(SITE.agentName)}</b>, Florida real estate sales associate · License ${esc(SITE.licenseNo)} · ${esc(SITE.brokerage)}${SITE.phone ? ` · ${esc(SITE.phone)}` : ""}</p>
    <p>${mls ? `${esc(SITE.mlsDisclaimer())} · ` : ""}<a href="#/contact">Contact</a> · <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></p>`;
}

// Keep listings fresh while the page is open, without moving the map or closing anything.
function startBackgroundRefresh() {
  if (S.feed.mode === "demo" || S.feed.mode === "pending") return;
  const tick = () => checkForUpdates().catch(() => {});
  setInterval(tick, (SITE.refreshMinutes || 5) * 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
}
async function checkForUpdates() {
  const st = await store.getSyncStatus();
  if (!st) return;
  if (st.version === S.feed.version && st.mode === S.feed.mode) {
    S.feed.lastSyncTimestamp = st.lastSyncTimestamp;
    renderFeedBanner();
    $$(".feed-refreshed").forEach((e) => (e.textContent = fmtDateTime(st.lastSyncTimestamp)));
    return;
  }
  applyFeed(await store.loadFeed());
  refreshViews();
}
let refreshQueued = false;
function refreshViews() {
  if (!$("#view-search").hidden) {
    // Don't yank an open map popup; refresh when it closes.
    if (map && map._popup && map.hasLayer(map._popup)) {
      if (!refreshQueued) { refreshQueued = true; map.once("popupclose", () => { refreshQueued = false; renderResults({ fitMap: false }); }); }
    } else renderResults({ fitMap: false });
  }
  const m = (location.hash || "").match(/^#\/home\/([\w-]+)/);
  if (m && S.feed.mode !== "demo" && !S.byId.has(m[1])) showGoneNotice();
  $$(".feed-refreshed").forEach((e) => (e.textContent = fmtDateTime(S.feed.lastSyncTimestamp)));
}
function showGoneNotice() {
  const host = $("#view-detail");
  if (!host || host.hidden || $(".gone-notice", host)) return;
  host.insertAdjacentHTML("afterbegin", `<div class="gone-notice" role="status"><b>This home is no longer available.</b> It went off-market, so it's been removed from search. <a href="#/">Back to search</a></div>`);
}

/* ---------------- controls ---------------- */
const fmtMoneyInput = (v) => "$" + Math.round(v).toLocaleString("en-US");
function fillSelect(sel, steps, { min, label = shortMoney } = {}) {
  sel.innerHTML = `<option value="">${min ? "No min" : "No max"}</option>` +
    steps.filter((v) => v > 0).map((v) => `<option value="${v}">${label(v)}</option>`).join("");
}

function buildControls() {
  buildRanges(); // price, payment, size, lot and HOA sliders (js/ranges.js)

  for (const el of $$("[data-seg]")) {
    const key = el.dataset.seg;
    el.innerHTML = SEGMENTS[key].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join("");
  }
  for (const g of $$(".type-grid")) g.innerHTML = HOME_TYPES.map((t) =>
    `<label><input type="checkbox" name="type" value="${t}" />${typeIcon(t)}${t}</label>`).join("");

  const places = new Set();
  S.listings.forEach((l) => { places.add(l.Neighborhood); places.add(l.City); places.add(l.PostalCode); places.add(l.County + " County"); });
  $("#placeList").innerHTML = [...places].sort().map((p) => `<option value="${esc(p)}">`).join("");

  drawHistogram();
}

function drawHistogram() {
  const c = $("#priceHist");
  const ctx = c.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  c.width = 280 * dpr; c.height = 56 * dpr; ctx.scale(dpr, dpr);
  const bins = PRICE_STEPS.length - 1;
  const counts = new Array(bins).fill(0);
  for (const l of S.listings) {
    let i = PRICE_STEPS.findIndex((v, k) => l.ListPrice >= v && l.ListPrice < (PRICE_STEPS[k + 1] ?? Infinity));
    counts[Math.min(Math.max(i, 0), bins - 1)]++;
  }
  const max = Math.max(...counts);
  const w = 280 / bins;
  const { priceMin: lo, priceMax: hi } = S.f;
  counts.forEach((n, i) => {
    const inRange = (lo == null || PRICE_STEPS[i] >= lo) && (hi == null || PRICE_STEPS[i] < hi);
    ctx.fillStyle = inRange ? "#0b6e63" : "#d5dbe0";
    const h = (n / max) * 52;
    ctx.fillRect(i * w + 1, 56 - h, w - 2, h);
  });
}

// Push state -> controls.
function syncControls() {
  const f = S.f;
  $("#q").value = f.q;
  $("#sort").value = f.sort;
  for (const el of $$("#filterbar [name], #moreForm [name]")) {
    if (el.name === "type") el.checked = f.types.includes(el.value);
    else if (el.name === "county") el.checked = f.counties.includes(el.value);
    else if (el.type === "checkbox") el.checked = !!f[el.name];
    else if (el.classList.contains("money")) { if (document.activeElement !== el) el.value = f[el.name] != null ? fmtMoneyInput(f[el.name]) : ""; }
    else el.value = f[el.name] ?? "";
  }
  for (const seg of $$("[data-seg]")) {
    const v = f[seg.dataset.seg];
    for (const b of $$("button", seg)) b.setAttribute("aria-pressed", String(String(v ?? "") === b.dataset.v));
  }
  // Pill labels
  const setPill = (k, text, on) => { const s = $(`[data-label=${k}]`); s.textContent = text; s.closest(".pill").classList.toggle("is-set", on); };
  const pr = f.priceMin != null || f.priceMax != null;
  setPill("price", pr ? `${f.priceMin != null ? shortMoney(f.priceMin) : "Any"} – ${f.priceMax != null ? shortMoney(f.priceMax) : "Any"}` : "Price", pr);
  const bb = f.bedsMin != null || f.bathsMin != null;
  setPill("beds", bb ? [f.bedsMin != null && `${f.bedsMin}+ bd`, f.bathsMin != null && `${f.bathsMin}+ ba`].filter(Boolean).join(", ") : "Beds & baths", bb);
  setPill("county", f.counties.length ? (f.counties.length === 1 ? f.counties[0] : `${f.counties.length} counties`) : "County", f.counties.length > 0);
  setPill("type", f.types.length ? (f.types.length === 1 ? f.types[0] : `Home type (${f.types.length})`) : "Home type", f.types.length > 0);
  const st = !(f.statusActive && f.statusContingent && !f.statusPending);
  setPill("status", st ? (f.statusPending ? "Incl. pending" : "Status (custom)") : "For sale", st);
  const d = defaults();
  const moreN = DRAWER_KEYS.filter((k) => f[k] !== d[k] && f[k] !== "").length;
  $("#moreCount").hidden = !moreN; $("#moreCount").textContent = moreN;
  $("#moreBtn").classList.toggle("is-set", moreN > 0);
  $("#boundsToggle").checked = !!f.bounds;
  syncRanges(f);
  drawHistogram();
}

function setFilters(patch, { fromMap = false } = {}) {
  Object.assign(S.f, patch);
  const qs = toQuery(S.f);
  history.replaceState(null, "", `${location.pathname}${qs ? "?" + qs : ""}${location.hash}`);
  syncControls();
  renderResults({ fitMap: !fromMap && !S.f.bounds });
}

/* ---------------- events ---------------- */
function wireEvents() {
  // Dropdown open/close
  for (const dd of $$(".dd")) {
    const btn = $(".pill", dd);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !dd.classList.contains("is-open");
      closeDropdowns();
      dd.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    $(".dd-panel", dd).addEventListener("click", (e) => e.stopPropagation());
  }
  document.addEventListener("click", closeDropdowns);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDropdowns(); closeDrawer(); } });

  // Generic inputs
  const onInput = (e) => {
    const el = e.target;
    if (!el.name) return;
    // The same controls exist in the top bar and the Filters panel: read the group that changed.
    const box = el.closest("#moreForm, #filterbar");
    if (el.name === "type") return setFilters({ types: $$("[name=type]:checked", box).map((i) => i.value) });
    if (el.name === "county") return setFilters({ counties: $$("[name=county]:checked", box).map((i) => i.value) });
    if (el.type === "checkbox") return setFilters({ [el.name]: el.checked });
    if (el.name === "keyword") return setFilters({ keyword: el.value.trim() });
    if (el.classList.contains("money")) {
      const v = parseMoney(el.value);
      if (el.value.trim() && v == null) { toast("Enter an amount like 450k, $1.2M or 3,000"); syncControls(); return; }
      return setFilters({ [el.name]: v });
    }
    const v = el.value === "" ? null : Number(el.value);
    setFilters({ [el.name]: Number.isFinite(v) ? v : null });
  };
  $("#filterbar").addEventListener("change", onInput);
  $("#moreForm").addEventListener("change", onInput);
  wireRanges((patch) => setFilters(patch));
  // Tidy typed amounts ("450k" → "$450,000") when leaving the field.
  document.addEventListener("focusout", (e) => { if (e.target.classList?.contains("money")) setTimeout(syncControls, 0); });
  $("#moreForm").addEventListener("submit", (e) => e.preventDefault());

  for (const seg of $$("[data-seg]")) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const key = seg.dataset.seg;
      const v = b.dataset.v;
      setFilters({ [key]: key === "stories" ? v : v === "" ? null : Number(v) });
    });
  }

  let qTimer;
  $("#q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => setFilters({ q: e.target.value.trim(), bounds: null }), 250); });
  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); setFilters({ q: $("#q").value.trim(), bounds: null }); if (location.hash.startsWith("#/home")) location.hash = "#/"; });
  $("#sort").addEventListener("change", (e) => setFilters({ sort: e.target.value }));

  const reset = () => { S.f = defaults(); setFilters({}); };
  $("#resetBtn").addEventListener("click", reset);
  $("#drawerReset").addEventListener("click", reset);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-action=reset]")) reset(); });

  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    setFilters(JSON.parse(c.dataset.clear));
  });

  $("#moreBtn").addEventListener("click", openDrawer);
  $$("#drawer [data-close]").forEach((el) => el.addEventListener("click", closeDrawer));

  $("#boundsToggle").addEventListener("change", (e) => setFilters({ bounds: e.target.checked ? boundsArr() : null }, { fromMap: true }));
  $("#mobileMapBtn").addEventListener("click", () => {
    const on = $("#view-search").classList.toggle("show-map");
    if (on) window.scrollTo(0, 0);
    $("#mobileMapBtn").textContent = on ? "List" : "Map";
    setTimeout(() => { map?.invalidateSize(); if (on && needsFit) fitToResults(); }, 50);
  });

  // Cards: save button + hover sync with map
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".save-btn"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const on = store.toggleSaved(b.dataset.id);
    S.saved = store.getSaved();
    $$(`.save-btn[data-id="${b.dataset.id}"]`).forEach((x) => { x.setAttribute("aria-pressed", String(on)); x.setAttribute("aria-label", on ? "Remove from saved" : "Save home"); });
    toast(on ? "Saved to your homes" : "Removed from saved homes");
    if (location.hash === "#/saved") renderSaved();
  });
  $("#cards").addEventListener("mouseover", (e) => hot(e.target.closest(".card")?.dataset.id));
  $("#cards").addEventListener("mouseleave", () => hot(null));

  // Auth modal
  $("#authForm").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "ok") { $("#authModal").close(); return; }
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await store.signIn({ displayName: fd.get("displayName"), email: fd.get("email") });
      signedIn();
    } catch (err) { $("#authStatus").textContent = err.message; }
  });
  $("#contactForm").addEventListener("submit", submitContact);
  $("#authModal").addEventListener("close", () => { if (!S.user) authThen = null; });
}

function closeDropdowns() {
  $$(".dd.is-open").forEach((d) => { d.classList.remove("is-open"); $(".pill", d).setAttribute("aria-expanded", "false"); });
}
let lastFocus;
function openDrawer() {
  lastFocus = document.activeElement;
  $("#drawer").hidden = false;
  $("#drawer .drawer-head .iconbtn").focus();
}
function closeDrawer() {
  if ($("#drawer").hidden) return;
  $("#drawer").hidden = true;
  lastFocus?.focus?.();
}
function observeSearchbar() {
  const sb = $(".searchbar");
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--searchbar-h", sb.offsetHeight + "px");
    map?.invalidateSize();
    if (needsFit) fitToResults();
  }).observe(sb);
}

/* ---------------- auth ---------------- */
let authThen = null;
function requireAuth(then) {
  if (S.user) return then();
  authThen = then;
  $("#authForm").reset();
  $("#authStatus").textContent = "";
  const cfg = store.authConfig();
  // Browser-only demo, or local testing: show the simple name/email form.
  $("#authForm").hidden = store.isRemote() && !cfg.devLogin;
  $("#authModal").showModal();
  if (store.isRemote() && cfg.googleClientId) renderGoogleButton(cfg.googleClientId);
  else if (store.isRemote() && !cfg.devLogin) $("#authStatus").textContent = "Sign-in is being set up and will be available shortly.";
}
function signedIn() {
  $("#authModal").close();
  toast(`Signed in as ${S.user?.displayName || "you"}`);
  if (authThen) { const fn = authThen; authThen = null; fn(); }
}

// "Sign in with Google" via Google Identity Services. Google shows its own account picker;
// we receive an ID token and the server verifies it before starting a session.
let gsiLoad;
function loadGsi() {
  gsiLoad ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gsiLoad = null; reject(new Error("Couldn't reach Google. Check your connection and try again.")); };
    document.head.append(s);
  });
  return gsiLoad;
}
let gsiReady = false;
async function renderGoogleButton(clientId) {
  const el = $("#gsiButton");
  el.innerHTML = `<span class="muted">Loading Google sign-in…</span>`;
  try {
    await loadGsi();
    if (!gsiReady) {
      google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        callback: async ({ credential }) => {
          $("#authStatus").textContent = "Signing you in…";
          try { await store.signInWithGoogle(credential); signedIn(); }
          catch (err) { $("#authStatus").textContent = err.message; }
        },
      });
      gsiReady = true;
    }
    el.innerHTML = "";
    google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", logo_alignment: "left", width: 300 });
  } catch (err) {
    el.innerHTML = "";
    $("#authStatus").textContent = err.message;
  }
}
function renderAccount() {
  const el = $("#account");
  if (S.user) {
    const initials = S.user.displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
    const face = S.user.picture
      ? `<img class="avatar" src="${esc(S.user.picture)}" alt="" referrerpolicy="no-referrer" title="${esc(S.user.email || "")}">`
      : `<span class="avatar" title="${esc(S.user.email || "")}">${esc(initials)}</span>`;
    el.innerHTML = `${face}<button class="linkbtn" id="signOut" type="button">Sign out</button>`;
    $("#signOut").onclick = () => { store.signOut(); toast("Signed out"); };
  } else {
    el.innerHTML = `<button class="btn btn-ghost" id="signIn" type="button">Sign in</button>`;
    $("#signIn").onclick = () => requireAuth(() => {});
  }
}

/* ---------------- map ---------------- */
// Basemap: Esri World Street Map (free with attribution, no key). If its tiles
// keep failing, fall back to OpenStreetMap's standard tiles.
// (CARTO's basemaps were dropped: they now require an API key.)
function addBasemap(m) {
  const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS',
    maxZoom: 19,
  }).addTo(m);
  let errors = 0;
  esri.on("tileerror", () => {
    if (++errors !== 6) return;
    m.removeLayer(esri);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
  });
}
// Fit the map to the current results. Skipped while the map is hidden (phones),
// because Leaflet can't size a hidden map; it runs again when the map is shown.
let needsFit = false;
function fitToResults() {
  if (!map) return;
  const el = $("#map");
  if (!el.offsetWidth || !el.offsetHeight) { needsFit = true; return; }
  needsFit = false;
  map.invalidateSize();
  if (S.results.length) map.fitBounds(L.latLngBounds(S.results.map((l) => [l.Latitude, l.Longitude])), { padding: [40, 40], maxZoom: 14 });
}
let map, markerLayer, markers = new Map(), galleryMaps = [];
function initMap() {
  if (!window.L) { // map library failed to load: keep search usable without it
    $("#map").innerHTML = `<p class="muted" style="padding:20px">Map unavailable.</p>`;
    map = null; return;
  }
  map = L.map("map", { zoomControl: true, preferCanvas: false }).setView(SITE.mapCenter, SITE.mapZoom);
  addBasemap(map);
  // Cluster nearby pins so tens of thousands of listings stay fast; individual price pins from zoom 15.
  markerLayer = (L.markerClusterGroup
    ? L.markerClusterGroup({
        chunkedLoading: true, maxClusterRadius: 50, disableClusteringAtZoom: 15, showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (c) => L.divIcon({ className: "pin-icon", html: `<div class="pin-cluster">${c.getChildCount().toLocaleString("en-US")}</div>`, iconSize: [0, 0] }),
      })
    : L.layerGroup()).addTo(map);
  const zoomClass = () => $("#map").classList.toggle("zoomed-out", map.getZoom() < 12);
  map.on("zoomend", zoomClass); zoomClass();
  map.on("moveend", () => { if (S.f.bounds) setFilters({ bounds: boundsArr() }, { fromMap: true }); });
}
function boundsArr() {
  if (!map) return null;
  const b = map.getBounds();
  return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => +n.toFixed(5));
}
function pinPrice(p) { return p >= 1e6 ? `$${(p / 1e6).toFixed(p >= 1e7 ? 0 : 1)}M` : `$${Math.round(p / 1e3)}K`; }

function renderMarkers(rows, fit) {
  if (!map) return;
  markerLayer.clearLayers(); markers.clear();
  const batch = [];
  for (const l of rows) {
    const reviewed = !!S.summaries[l.ListingId];
    const pending = l.demo.StandardStatus !== "Active";
    const icon = L.divIcon({
      className: "pin-icon",
      html: `<div class="pin ${reviewed ? "has-reviews" : ""} ${pending ? "is-pending" : ""}" data-id="${l.ListingId}">${pinPrice(l.ListPrice)}</div>`,
      iconSize: [0, 0],
    });
    const m = L.marker([l.Latitude, l.Longitude], { icon, riseOnHover: true, keyboard: true, title: l.UnparsedAddress })
      .bindPopup(() => `<div class="map-pop">${cardHTML(l, { compact: true })}</div>`, { closeButton: false, offset: [0, -6] })
      .on("mouseover", () => hot(l.ListingId, false))
      .on("mouseout", () => hot(null, false));
    batch.push(m);
    markers.set(l.ListingId, m);
  }
  if (markerLayer.addLayers) markerLayer.addLayers(batch); else batch.forEach((m) => m.addTo(markerLayer));
  if (fit && rows.length) fitToResults();
}
function hot(id, scroll = false) {
  $$(".pin.is-hot, .card.is-hot").forEach((e) => e.classList.remove("is-hot"));
  if (!id) return;
  $(`.pin[data-id="${id}"]`)?.classList.add("is-hot");
  const c = $(`#cards .card[data-id="${id}"]`);
  c?.classList.add("is-hot");
  if (scroll) c?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------------- cards ---------------- */
function badgesFor(l) {
  const d = l.demo, b = [];
  if (d.StandardStatus === "Pending") b.push(`<span class="badge badge-pending">Pending</span>`);
  else if (d.StandardStatus === "Active Under Contract") b.push(`<span class="badge badge-pending">Under contract</span>`);
  if (d.DaysOnMarket <= 7) b.push(`<span class="badge badge-new">New · ${d.DaysOnMarket === 0 ? "today" : d.DaysOnMarket + "d"}</span>`);
  if (d.PriceReduced) b.push(`<span class="badge badge-reduced">↓ ${shortMoney(d.OriginalListPrice - l.ListPrice)}</span>`);
  if (d.OpenHouse) b.push(`<span class="badge badge-open">Open ${weekday(d.OpenHouse.date).split(",")[0]}</span>`);
  return b.slice(0, 3).join("");
}

function cardHTML(l, { compact = false } = {}) {
  const s = S.summaries[l.ListingId];
  const saved = S.saved.has(l.ListingId);
  const rating = s
    ? `<span class="rating-mini"><span class="star">★</span>${s.avg.toFixed(1)} <span class="n">· ${s.count} tour${s.count > 1 ? "s" : ""}</span></span>`
    : `<span class="no-reviews">No tour reviews yet</span>`;
  return `<a class="card" href="#/home/${l.ListingId}" data-id="${l.ListingId}">
    <div class="card-media">${cardMedia(l)}<div class="badges">${badgesFor(l)}</div>
      ${compact ? "" : `<button class="save-btn" type="button" data-id="${l.ListingId}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save home"}">${HEART}</button>`}
    </div>
    <div class="card-body">
      <div class="price">${fmt$(l.ListPrice)}${l.demo.PriceReduced && !compact ? `<s>${fmt$(l.demo.OriginalListPrice)}</s>` : ""}${compact ? "" : `<span class="est-pay" title="Estimated monthly cost: ${S.f.payDown ?? 20}% down, ${S.f.payRate ?? 6.4}% 30-yr, plus est. taxes, insurance and HOA">Est. ${fmt$(monthlyCost(l, { down: S.f.payDown, rate: S.f.payRate }).total)}/mo</span>`}</div>
      <div class="facts"><span><b>${l.BedroomsTotal}</b> bd</span><span><b>${l.BathroomsTotalInteger}</b> ba</span><span><b>${fmtN(l.LivingArea)}</b> sqft</span>${compact ? "" : `<span>${l.PropertyType}</span>`}</div>
      <p class="addr">${esc(l.UnparsedAddress)}</p>
      ${isMls(l) ? `<p class="courtesy">${mlsMark()}<span>Courtesy of ${esc(l.ListOfficeName)}</span></p>` : ""}
      ${compact ? `<div style="margin-top:6px">${rating}</div>`
        : `<div class="card-foot">${rating}${isMls(l) ? "" : `<span class="office" title="${esc(l.ListOfficeName)}">${esc(l.ListOfficeName)}</span>`}</div>`}
    </div>
  </a>`;
}

// MLS listings show their primary photo; homes without one (and demo data) show satellite imagery.
function cardMedia(l) {
  if (!l.primaryPhotoUrl) return satelliteThumb(l, { fallback: houseSVG(l) });
  return `<div class="card-photo">
    <div class="sat-fallback">${houseSVG(l)}</div>
    <img src="${esc(l.primaryPhotoUrl)}" alt="Photo of ${esc(l.StreetAddress)}" loading="lazy" decoding="async"
      onerror="this.parentNode.classList.add('photo-failed')">
    ${l.photoCount > 1 ? `<span class="photo-count">${l.photoCount} photos</span>` : ""}
  </div>`;
}

// Keyword search: descriptions live on the server, so ask it which listings match, then re-render.
const kw = { q: "", keys: null, pending: null };
function keywordKeys() {
  const q = S.f.keyword || "";
  if (!q || S.feed.mode === "demo") return null;
  if (kw.q === q) return kw.keys;
  kw.q = q; kw.keys = null;
  const p = kw.pending = store.searchDescriptions(q).then((keys) => {
    if (kw.pending !== p) return; // a newer search replaced this one
    kw.keys = keys;
    if (keys) renderResults();
  });
  return null;
}

function renderResults({ fitMap = false } = {}) {
  S.summaries = store.getReviewSummaries();
  const kwKeys = keywordKeys();
  const rows = sortListings(S.listings.filter((l) => matches(l, S.f, S.summaries[l.ListingId], kwKeys)), S.f.sort, S.summaries);
  S.results = rows;
  const cards = $("#cards");
  cards.innerHTML = rows.slice(0, 200).map((l) => cardHTML(l)).join("");
  $("#empty").hidden = rows.length > 0;
  const reviewed = rows.filter((l) => S.summaries[l.ListingId]).length;
  $("#resultCount").textContent = `${rows.length} home${rows.length === 1 ? "" : "s"}${reviewed ? ` · ${reviewed} with verified-tour reviews` : ""}`;
  $("#listTitle").textContent = S.f.q ? `${titleCase(S.f.q)} homes for sale`
    : S.f.counties.length === 1 ? `${S.f.counties[0]} County homes for sale` : "South Florida homes for sale";
  $("#chips").innerHTML = chipsFor(S.f).map((c) =>
    `<button class="chip" type="button" data-clear='${esc(JSON.stringify(c.clear))}' aria-label="Remove filter ${esc(c.label)}">${esc(c.label)} <b>✕</b></button>`).join("");
  renderMarkers(rows, fitMap);
}
const titleCase = (s) => s.replace(/\b\w/g, (m) => m.toUpperCase());

/* ---------------- routing ---------------- */
function show(id) {
  for (const v of ["view-search", "view-detail", "view-saved", "view-myreviews", "view-mlssearch"]) $("#" + v).hidden = v !== id;
  $(".searchbar").hidden = id !== "view-search";
  $$(".mainnav a").forEach((a) => a.classList.toggle("is-active",
    (id === "view-search" && a.getAttribute("href") === "#/") ||
    (id === "view-saved" && a.getAttribute("href") === "#/saved") ||
    (id === "view-myreviews" && a.getAttribute("href") === "#/my-reviews") ||
    (id === "view-mlssearch" && a.getAttribute("href") === "#/lookup")));
  $$(".tabbar a").forEach((a) => a.classList.toggle("is-active", a.dataset.view === id || (id === "view-detail" && a.dataset.view === "view-search")));
  document.body.classList.toggle("on-search", id === "view-search");
}
let firstSearchRender = true;
function route() {
  // Arrived on an indexable listing page (/homes/<key>-<slug>): continue in the app.
  if (window.__SEO_LISTING__) {
    const key = window.__SEO_LISTING__; window.__SEO_LISTING__ = null;
    document.getElementById("seoListing")?.remove();
    history.replaceState(null, "", `/${location.search}#/home/${key}`);
  }
  const h = location.hash || "#/";
  const m = h.match(/^#\/home\/([\w-]+)/);
  if (m && S.byId.has(m[1])) { show("view-detail"); renderDetail(S.byId.get(m[1])); window.scrollTo(0, 0); return; }
  if (m) toast("That home is no longer available.");
  if (h === "#/saved") { show("view-saved"); renderSaved(); return; }
  if (h === "#/my-reviews") { show("view-myreviews"); renderMyReviews(); return; }
  if (h === "#/lookup") { show("view-mlssearch"); renderMlsSearch(); return; }
  if (h === "#/mls-search") {
    // Old links: the Flexmls page is only a backup while the live feed is unavailable.
    if (S.feed.mode === "pending") { show("view-mlssearch"); renderMlsSearch({ withFlexmls: true }); return; }
    history.replaceState(null, "", location.pathname + location.search + "#/lookup");
    show("view-mlssearch"); renderMlsSearch(); return;
  }
  if (h === "#/contact") {
    history.replaceState(null, "", location.pathname + location.search + "#/");
    route();
    contactAgent(`Message from Toured`, "", "");
    return;
  }
  if (S.feed.mode === "pending") { show("view-mlssearch"); renderMlsSearch({ withFlexmls: true }); return; }
  show("view-search");
  document.title = "Toured — South Florida homes reviewed by people who walked through";
  renderResults({ fitMap: firstSearchRender && !S.f.bounds });
  firstSearchRender = false;
  setTimeout(() => map?.invalidateSize(), 0);
}

/* ---------------- detail ---------------- */
function renderDetail(l) {
  const mls = isMls(l);
  const extra = mls ? S.details.get(l.ListingId) : null;
  if (extra) Object.assign(l, extra.fields, { Parcel: extra.parcel ?? l.Parcel });
  const d = l.demo;
  const reviews = store.getReviews(l.ListingId);
  const s = S.summaries[l.ListingId];
  const saved = S.saved.has(l.ListingId);
  const mine = S.user && reviews.find((r) => r.userId === S.user.id);
  const reviewsOff = SITE.reviewsDisabled.includes(l.ListingId) || (l.MlsNumber && SITE.reviewsDisabled.includes(l.MlsNumber));
  document.title = `${l.StreetAddress} — ${fmt$(l.ListPrice)} | Toured`;
  // "est." badges mark generated placeholder values; MLS listings never have any.
  const est = mls ? "" : `<span class="est" title="Placeholder until an MLS feed is connected">est.</span>`;
  const pr = `<span class="est est-pr" title="From the county property appraiser's tax roll (FL Dept. of Revenue)">public record</span>`;
  const fromPR = (k) => !mls && (d._fromParcel || []).includes(k);
  const statusDot = d.StandardStatus === "Active" ? "" : "pending";

  const keyFacts = mls ? [
    ["Property type", l.PropertyType],
    d.YearBuilt && ["Year built", d.YearBuilt],
    d.LotSizeSquareFeet && ["Lot size", `${fmtN(d.LotSizeSquareFeet)} sqft`],
    l.PricePerSqFt && ["Price / sqft", fmt$(l.PricePerSqFt)],
    ["HOA", d.AssociationFee ? `${fmt$(d.AssociationFee)}/mo` : "None listed"],
    ["Garage", d.GarageSpaces ? `${d.GarageSpaces} space${d.GarageSpaces > 1 ? "s" : ""}` : "None listed"],
    d.StoriesTotal && ["Stories", d.StoriesTotal],
    d.DaysOnMarket != null && ["Days on market", d.DaysOnMarket],
    ["County", l.County],
    d.TaxAnnualAmount && ["Annual taxes (per listing)", fmt$(d.TaxAnnualAmount)],
    d.ArchitecturalStyle && ["Style", esc(d.ArchitecturalStyle)],
  ].filter(Boolean) : [
    ["Property type", l.PropertyType],
    ["Year built", d.YearBuilt + " " + (fromPR("YearBuilt") ? pr : est)],
    ["Lot size", d.LotSizeSquareFeet ? `${fmtN(d.LotSizeSquareFeet)} sqft ${fromPR("LotSizeSquareFeet") ? pr : est}` : "—"],
    ["Price / sqft", fmt$(l.PricePerSqFt)],
    ["HOA", (d.AssociationFee ? `${fmt$(d.AssociationFee)}/mo` : "None") + " " + est],
    ["Garage", (d.GarageSpaces ? `${d.GarageSpaces} space${d.GarageSpaces > 1 ? "s" : ""}` : "None") + " " + est],
    ["Stories", d.StoriesTotal + " " + est],
    ["Days listed", d.DaysOnMarket + " " + est],
    ["County", l.County],
    ["Flood zone", d.FloodZone + (d.FloodZone === "X" ? " (minimal risk)" : " (flood insurance likely required)") + " " + est],
    ["Est. tax after purchase", fmt$(d.TaxAnnualAmount) + "/yr " + est],
    ["Style", d.ArchitecturalStyle + " " + est],
  ];
  const features = [
    d.PoolPrivateYN && "Private pool", d.WaterfrontYN && "Waterfront", d.View && `${esc(d.View)} view`,
    d.FireplaceYN && "Fireplace", d.CentralAir && "Central air", d.GatedCommunity && "Gated community",
    d.SolarPanels && "Solar panels", d.ImpactWindows && "Impact windows & doors",
    d.CBS && "CBS (concrete block) construction", d.ShortTermRental && "Short-term rentals allowed",
    d.BoatDock && "Private boat dock", d.OceanAccess && "Ocean access", d.GolfCommunity && "Golf community", d.EVCharging && "EV charging", d.VirtualTour && "Virtual tour available",
    d.NewConstructionYN && "New construction", d.SeniorCommunityYN && "55+ community",
  ].filter(Boolean);

  const photos = mls ? (extra?.fields.photos || (l.primaryPhotoUrl ? [{ url: l.primaryPhotoUrl, medium: l.primaryPhotoUrl, thumb: l.primaryPhotoUrl, caption: "" }] : [])) : [];
  const remarks = mls ? (extra ? (d.PublicRemarks || "No remarks provided by the listing broker.") : "Loading listing details…") : d.PublicRemarks;

  const gallery = mls ? `
    <div class="gallery">
      <div id="galPhotos">${carouselHTML(photos, { address: l.UnparsedAddress, fallback: houseSVG(l), loading: !extra })}</div>
      <div><div class="gal-map" id="galMain" role="img" aria-label="Satellite view of the property"></div><span class="gal-label">Satellite</span></div>
      <div><div class="gal-map" id="galStreet" role="img" aria-label="Street map"></div><span class="gal-label">Map</span></div>
    </div>` : `
    <div class="gallery">
      <div><div class="gal-map" id="galMain" role="img" aria-label="Satellite view of the property${l.Parcel?.Shape ? " with the county parcel boundary outlined" : ""}"></div>
        <a class="photos-link" href="${esc(photoGalleryUrl(l))}" target="_blank" rel="noopener noreferrer">View photos ↗</a>
        <span class="gal-label">${l.Parcel?.Shape ? "Satellite · parcel boundary from county records" : "Satellite view"}</span></div>
      <div><div class="gal-map" id="galWide" role="img" aria-label="Satellite view of the neighborhood"></div><span class="gal-label">Neighborhood</span></div>
      <div><div class="gal-map" id="galStreet" role="img" aria-label="Street map"></div><span class="gal-label">Map</span></div>
    </div>`;

  const reviewsSection = reviewsOff ? `
        <section class="section" id="reviews">
          <h2>Tour reviews</h2>
          <p class="muted">Reviews are turned off for this listing at the seller's request.</p>
        </section>` : `
        <section class="section" id="reviews">
          <h2>Tour reviews</h2>
          ${reviewSummaryHTML(s)}
          <div class="cta-review">
            <p>${mine ? "Thanks — you've reviewed this home." : "Toured this home? Share what the listing doesn't tell you."}</p>
            ${mine ? "" : `<button class="btn" type="button" id="writeReview">Write a tour review</button>`}
          </div>
          <div id="reviewList">${reviews.length ? reviews.map(reviewHTML).join("") : `<p class="muted" style="padding:12px 0">No reviews yet. Reviews can only be written by signed-in users who certify they toured the home in person.</p>`}</div>
          ${mls ? `<p class="muted not-mls">Tour reviews are opinions of Toured users, not information from BeachesMLS or the listing broker.</p>` : ""}
        </section>`;

  $("#view-detail").innerHTML = `
    <div class="crumbs">
      <a class="linkbtn" href="#/" data-back>← Back to search</a>
      <button class="save-btn" style="position:static" type="button" data-id="${l.ListingId}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save home"}">${HEART}</button>
    </div>
    ${gallery}
    <div class="detail-grid">
      <div>
        <div class="badges" style="position:static;margin-bottom:8px">${badgesFor(l)}</div>
        <p class="d-price">${fmt$(l.ListPrice)}${d.PriceReduced ? ` <s style="font-size:16px;color:var(--ink-3);font-weight:500">${fmt$(d.OriginalListPrice)}</s>` : ""}</p>
        <div class="d-facts"><span><b>${l.BedroomsTotal}</b> beds</span><span><b>${l.BathroomsTotalInteger}</b> baths</span><span><b>${fmtN(l.LivingArea)}</b> sqft</span></div>
        <p class="d-addr">${esc(l.UnparsedAddress)}</p>
        <div class="status-line">
          <span><span class="dot ${statusDot}"></span> ${d.StandardStatus} ${est}</span>
          <span>·</span><span>${esc(l.Neighborhood)}</span><span>·</span><span>${esc(l.County)} County</span>
          ${s && !reviewsOff ? `<span>·</span><a href="#reviews" class="rating-mini" style="text-decoration:none;color:inherit"><span class="star">★</span>${s.avg.toFixed(1)} <span class="n">(${s.count} verified tour${s.count > 1 ? "s" : ""})</span></a>` : ""}
        </div>
        ${mls ? idxAttributionHTML(l) : ""}
        ${d.OpenHouse ? `<div class="cta-review" style="background:#fff;border:1.5px solid var(--line)"><p><b>Open house</b> · ${weekday(d.OpenHouse.date)}, ${fmtTime(d.OpenHouse.start)}–${fmtTime(addHours(d.OpenHouse.start, d.OpenHouse.durationHrs))} ${est}</p><span class="muted">Tour it, then come back to review it</span></div>` : ""}
        ${reviewsSection}
        <section class="section">
          <h2>About this home</h2>
          <p id="remarks">${esc(remarks)}</p>
        </section>
        ${publicRecordsHTML(l)}
        <section class="section">
          <h2>Key facts</h2>
          <div class="keyfacts">${keyFacts.map(([k, v]) => `<div class="kf"><div><small>${k}</small><strong>${v}</strong></div></div>`).join("")}</div>
        </section>
        ${features.length ? `<section class="section"><h2>Features ${est}</h2><ul class="feature-list">${features.map((x) => `<li>${x}</li>`).join("")}</ul></section>` : ""}
        <section class="section" style="border:0">
          ${mls ? `
          <p class="idx-source">${mlsMark()} Listing information provided by BeachesMLS through IDX. Listing courtesy of <b>${esc(l.ListOfficeName)}</b>. MLS #${esc(l.MlsNumber || "—")}. Last updated ${esc(fmtDateTime(l.ModificationTimestamp))}; feed refreshed <span class="feed-refreshed">${esc(fmtDateTime(S.feed.lastSyncTimestamp))}</span>.</p>
          <p class="idx-disclaimer">${esc(SITE.mlsDisclaimer())}</p>
          <p class="muted" style="font-size:13px">Displayed by ${esc(SITE.agentName)}, ${esc(SITE.brokerage)}. Public records, tax estimates, satellite imagery and tour reviews on this page are not from BeachesMLS.</p>` : `
          <p class="muted" style="font-size:13px">Listed by <b>${esc(l.ListOfficeName)}</b>. Listing facts retrieved ${fmtDate(l.SourceRetrieved)} from public listing data (<a href="${esc(l.SourceUrl)}" target="_blank" rel="noopener noreferrer">source</a>). Fields marked ${est} are placeholders. Tour reviews are user opinions and are not verified by the listing broker.</p>
          <p class="muted" style="font-size:12px">Demo data — not from an MLS feed.</p>`}
        </section>
      </div>
      <aside>
        <div class="side-card">
          <h3>Want to see it in person?</h3>
          <p class="muted" style="font-size:14px">Request a tour and a licensed local agent will reach out, usually within the hour. After you tour, come back and leave a verified review.</p>
          <button class="btn" type="button" id="reqTour">Request a tour</button>
          ${reviewsOff ? "" : `<button class="btn btn-ghost" type="button" style="margin-top:8px" id="sideReview">${mine ? "View your review" : "I toured this home"}</button>`}
        </div>
        <div class="side-card calc" id="calc"></div>
      </aside>
    </div>`;

  $("#writeReview")?.addEventListener("click", () => requireAuth(() => openReviewForm(l)));
  $("#sideReview")?.addEventListener("click", () => mine ? $("#reviewList").scrollIntoView({ behavior: "smooth" }) : requireAuth(() => openReviewForm(l)));
  $("#reqTour").addEventListener("click", () => {
    const home = `${l.UnparsedAddress}${l.MlsNumber ? ` (MLS #${l.MlsNumber})` : ""}`;
    contactAgent(`Tour request: ${home}`, `I'd like to tour ${l.UnparsedAddress} (listed at ${fmt$(l.ListPrice)}).`, home);
  });
  $("#reviewList")?.addEventListener("click", async (e) => {
    const h = e.target.closest("[data-helpful]");
    if (h && store.isRemote() && !S.user) { requireAuth(() => renderDetail(l)); return; }
    if (h) { if (store.markHelpful(h.dataset.helpful)) { renderDetail(l); toast("Thanks for the feedback"); } else toast("You already marked this helpful"); }
    const del = e.target.closest("[data-delete]");
    if (del && confirm("Delete your review?")) { await store.deleteReview(del.dataset.delete, S.user); S.summaries = store.getReviewSummaries(); renderDetail(l); toast("Review deleted"); }
  });
  renderCalc(l);

  if (mls) {
    initCarousel($("#galPhotos"), photos, {
      address: l.UnparsedAddress,
      onOpen: (i) => openLightbox(photos, i, { address: l.UnparsedAddress, compliance: idxAttributionHTML(l, { compact: true }) }),
    });
  }

  if (window.L) {
    galleryMaps.forEach((m) => m.remove());
    galleryMaps = mls
      ? [satelliteMap("galMain", l)]
      : [satelliteMap("galMain", l), satelliteMap("galWide", l, { zoom: 17, interactive: false })];
    const street = L.map("galStreet", { zoomControl: false, scrollWheelZoom: false, dragging: false, doubleClickZoom: false, touchZoom: false, keyboard: false })
      .setView([l.Latitude, l.Longitude], 15);
    addBasemap(street);
    L.marker([l.Latitude, l.Longitude], { icon: L.divIcon({ className: "pin-icon", html: `<div class="pin">${pinPrice(l.ListPrice)}</div>`, iconSize: [0, 0] }) }).addTo(street);
    galleryMaps.push(street);
  }

  if (mls) loadMlsExtras(l);
}

// Listing firm, MLS #, last-updated and the BeachesMLS mark (IDX rules: firm name plus an email or
// phone, in type no smaller than the listing details). Shown on the listing and in the photo viewer.
function idxAttributionHTML(l, { compact = false } = {}) {
  const contact = [
    l.ListOfficePhone && `<a href="tel:${esc(String(l.ListOfficePhone).replace(/[^0-9+]/g, ""))}">${esc(l.ListOfficePhone)}</a>`,
    l.ListOfficeEmail && `<a href="mailto:${esc(l.ListOfficeEmail)}">${esc(l.ListOfficeEmail)}</a>`,
  ].filter(Boolean).join(" · ");
  return `<div class="idx-attrib${compact ? " idx-attrib-compact" : ""}">
    <div class="idx-firm">${mlsMark()}<span>Listing courtesy of <b>${esc(l.ListOfficeName || "—")}</b>${contact ? ` · ${contact}` : ""}</span></div>
    <div class="idx-meta">MLS #: <b>${esc(l.MlsNumber || "—")}</b> · Last updated ${esc(fmtDateTime(l.ModificationTimestamp))} · Feed refreshed <span class="feed-refreshed">${esc(fmtDateTime(S.feed.lastSyncTimestamp))}</span></div>
    ${compact ? `<div class="idx-disclaimer">${esc(SITE.mlsDisclaimer())}</div>` : ""}
  </div>`;
}

// Loads full details (all photos, remarks, office contact) and public records for an MLS listing.
const loading = new Set();
async function loadMlsExtras(l) {
  const id = l.ListingId;
  const cached = S.details.get(id) || {};
  const stale = !cached.at || Date.now() - cached.at > (SITE.refreshMinutes || 5) * 60e3;
  const onThisListing = () => location.hash === `#/home/${id}`;

  if (stale && !loading.has(`d:${id}`)) {
    loading.add(`d:${id}`);
    store.loadListingDetail(id).then((r) => {
      if (r.gone) { handleGone(l); return; }
      const { Parcel, ...fields } = r;
      S.details.set(id, { ...(S.details.get(id) || {}), at: Date.now(), fields });
      if (onThisListing() && !document.getElementById("photoModal")?.open) renderDetail(l);
    }).catch(() => {
      if (onThisListing() && !cached.fields) $("#remarks") && ($("#remarks").textContent = "Listing details are temporarily unavailable. Please try again shortly.");
    }).finally(() => loading.delete(`d:${id}`));
  }

  if ((cached.parcelStatus === undefined || cached.parcelStatus === "pending") && !loading.has(`p:${id}`)) {
    loading.add(`p:${id}`);
    const retry = cached.parcelStatus === "pending";
    store.loadParcel(id).then((r) => {
      const entry = S.details.get(id) || {};
      S.details.set(id, { ...entry, parcel: r.parcel, parcelStatus: r.status });
      l.Parcel = r.parcel;
      if (!onThisListing()) return;
      const sec = $("#records");
      if (sec) sec.outerHTML = publicRecordsHTML(l);
      loadHistoryFor(l);
      if (r.parcel?.Shape && galleryMaps[0]) {
        const poly = addParcelOutline(galleryMaps[0], r.parcel.Shape);
        galleryMaps[0].fitBounds(poly.getBounds(), { padding: [30, 30], maxZoom: 20 });
      }
      // County server was slow: try once more shortly.
      if (r.status === "pending" && !retry) setTimeout(() => { S.details.get(id).parcelStatus = "pending"; loadMlsExtras(l); }, 10000);
    }).finally(() => loading.delete(`p:${id}`));
  }
}

function handleGone(l) {
  S.listings = S.listings.filter((x) => x.ListingId !== l.ListingId);
  S.byId.delete(l.ListingId);
  S.details.delete(l.ListingId);
  showGoneNotice();
}

// Your Flexmls IDX Lite search, embedded (BeachesMLS-provided; compliance handled by Flexmls).
// "Look up any home": tour reviews, taxes, sale history and county records for any address.
// withFlexmls = the backup page used only while the live MLS feed is unavailable: the free
// Flexmls IDX search beside the lookup panel.
function renderMlsSearch({ withFlexmls = false } = {}) {
  const el = $("#view-mlssearch");
  const mode = withFlexmls ? "flexmls" : "lookup";
  if (el.dataset.mode === mode) return; // keep the visitor's lookup (and the iframe) when coming back
  el.dataset.mode = mode;
  const panelHTML = `<aside class="toured-panel" aria-label="Toured home lookup">
        <form class="tp-form" id="tpForm" role="search">
          <label class="tp-label" for="tpAddr">${withFlexmls ? "Looking at a home?" : "Enter an address"}</label>
          <p class="tp-help">${withFlexmls ? "Copy its address from the MLS search and paste it here." : "Any home in Broward, Palm Beach or St. Lucie County, for sale or not."}</p>
          <div class="searchbox tp-box">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input id="tpAddr" type="search" placeholder="e.g. 1020 SE 9th Ave, Fort Lauderdale" autocomplete="off" required>
          </div>
          <button class="btn tp-go" type="submit">Look up</button>
        </form>
        <div class="tp-result" id="tpResult" aria-live="polite"></div>
      </aside>`;
  el.classList.toggle("lookup-page", !withFlexmls);
  el.innerHTML = withFlexmls
    ? `<h1>MLS Search</h1>
    <p class="muted" style="margin-bottom:14px">Search every active BeachesMLS listing with photos, powered by Flexmls IDX for ${esc(SITE.agentName)}, ${esc(SITE.brokerage)}. Found a home you like? Paste its address in the Toured panel to see tour reviews, taxes and public records.</p>
    <div class="mls-layout">
      <div class="idx-frame-wrap">
        <iframe src="${esc(SITE.idxLiteUrl)}" title="BeachesMLS listing search (Flexmls IDX)" loading="lazy"></iframe>
      </div>
      ${panelHTML}
    </div>
    <p class="muted" style="font-size:13px;margin-top:10px">Search not loading? <a href="${esc(SITE.idxLiteUrl)}" target="_blank" rel="noopener noreferrer">Open MLS search in a new tab ↗</a></p>`
    : `<h1>Look up any home</h1>
    <p class="muted" style="margin-bottom:16px">See tour reviews, property taxes, sale history and county records for any home, whether it's for sale or not. Toured a home? You can review it here too.</p>
    ${panelHTML}`;
  $("#tpForm").addEventListener("submit", (e) => { e.preventDefault(); panelLookup($("#tpAddr").value); });
  $("#tpResult").addEventListener("click", panelClick);
  $("#tpResult").addEventListener("change", (e) => {
    if (e.target.id === "tpUnit" && e.target.value) panelLookup(e.target.dataset.address, e.target.value);
  });
  renderPanelHome();
}

/* ---------- Toured lookup panel (Look up page) ---------- */
const panel = { property: null, seq: 0 };
const normAddr = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\b(STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|LANE|LN|COURT|CT|CIRCLE|CIR|BOULEVARD|BLVD|TERRACE|TER|PLACE|PL|WAY|TRAIL|TRL)\b/g, "").replace(/\b(\d+)(ST|ND|RD|TH)\b/g, "$1").replace(/\s+/g, " ").trim();

// Homes with reviews (listings and looked-up properties), newest activity first.
function reviewedHomes() {
  const seen = new Map();
  for (const r of store.getAllReviews()) {
    const e = seen.get(r.listingId) || { key: r.listingId, address: r.address || S.byId.get(r.listingId)?.UnparsedAddress, last: r.createdAt };
    if (r.createdAt > e.last) e.last = r.createdAt;
    seen.set(r.listingId, e);
  }
  return [...seen.values()].filter((e) => e.address).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 8);
}

function renderPanelHome() {
  panel.property = null;
  const homes = reviewedHomes();
  $("#tpResult").innerHTML = homes.length ? `
    <h3 class="tp-h">Homes with tour reviews</h3>
    <ul class="tp-list">${homes.map((h) => {
      const s = S.summaries[h.key] || store.getReviewSummaries()[h.key];
      return `<li><button type="button" class="tp-home" data-key="${esc(h.key)}" data-address="${esc(h.address)}">
        <span class="tp-home-addr">${esc(h.address)}</span>
        ${s ? `<span class="rating-mini"><span class="star">★</span>${s.avg.toFixed(1)} <span class="n">· ${s.count} tour${s.count > 1 ? "s" : ""}</span></span>` : ""}
      </button></li>`;
    }).join("")}</ul>` : `<p class="muted tp-empty">Tour reviews, property taxes, sale history and county records for any home in Broward, Palm Beach and St. Lucie counties.</p>`;
}

async function panelLookup(address, parcelKey = "") {
  address = String(address || "").trim();
  if (!address) return;
  const my = ++panel.seq;
  const out = $("#tpResult");
  out.innerHTML = `<p class="tp-status"><span class="tp-spinner" aria-hidden="true"></span> Looking up ${esc(address)}…</p>`;
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await store.lookupProperty(address, parcelKey);
    if (r.status !== "slow") break;
    if (my === panel.seq) out.innerHTML = `<p class="tp-status"><span class="tp-spinner" aria-hidden="true"></span> County records are slow right now. Still trying…</p>`;
  }
  if (my !== panel.seq) return; // a newer lookup started
  if (r.status === "matched") return renderPanelProperty(r.property);
  if (r.status === "choose_unit") {
    out.innerHTML = `<div class="tp-card">
      <p class="tp-addr">${esc(r.address)}</p>
      <label class="field">Which unit?
        <select id="tpUnit" data-address="${esc(address)}">
          <option value="">Choose a unit (${r.units.length})</option>
          ${r.units.map((u) => `<option value="${esc(u.key)}">${esc(u.address)}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="linkbtn" data-tp="clear">← Look up another home</button>
    </div>`;
    return;
  }
  out.innerHTML = `<div class="tp-card"><p>${esc(r.message || "Lookup is temporarily unavailable. Please try again.")}</p>
    <button type="button" class="linkbtn" data-tp="clear">← Back</button></div>`;
}

function panelListing(p) {
  // A listing-shaped object so the shared review form, reviews and imagery work for any home.
  return {
    ListingId: p.key, UnparsedAddress: p.address, StreetAddress: p.street, PostalCode: p.postalCode,
    County: p.county, Latitude: p.lat, Longitude: p.lng, Parcel: p.parcel, ListPrice: null,
    onReviewChange: () => renderPanelProperty(p),
  };
}

function renderPanelProperty(p) {
  panel.property = p;
  S.summaries = store.getReviewSummaries();
  const l = panelListing(p);
  const pc = p.parcel || {};
  const reviews = store.getReviews(p.key);
  const s = S.summaries[p.key];
  const mine = S.user && reviews.find((r) => r.userId === S.user.id);
  const reviewsOff = SITE.reviewsDisabled.includes(p.key);
  // Is this home also in Toured's own listing data? Link to its full page.
  const match = S.listings.find((x) => normAddr(x.StreetAddress) === normAddr(p.street) && String(x.PostalCode) === String(p.postalCode));
  const facts = [
    ["Land use", esc(pc.LandUse || "—")],
    ["Year built", pc.YearBuilt || "—"],
    ["Living area (county)", pc.LivingAreaSqFt ? `${fmtN(pc.LivingAreaSqFt)} sqft` : "—"],
    ["Lot size", pc.LotSqFt ? `${fmtN(pc.LotSqFt)} sqft` : "—"],
    ["Market (just) value", pc.JustValue ? fmt$(pc.JustValue) : "—"],
    ["Taxable value", pc.TaxableValueNonSchool ? fmt$(pc.TaxableValueNonSchool) : "—"],
    ["Homestead", pc.Homestead ? "Yes" : "No"],
    ["Est. tax (current owner)", pc.EstTaxCurrentOwner ? `${fmt$(pc.EstTaxCurrentOwner)}/yr` : "—"],
    ["Est. tax after a sale", pc.JustValue ? `${fmt$(taxEstimates({ County: p.county, ListPrice: 0, demo: {} }, pc).afterBuy)}/yr` : "—"],
    ["Last sale", saleText(pc.LastSale)],
    ["Prior sale", saleText(pc.PriorSale)],
  ];
  $("#tpResult").innerHTML = `<div class="tp-card">
    <div class="tp-media">${satelliteThumb(l, { fallback: houseSVG({ ...l, PropertyType: /condo|co-op/i.test(pc.LandUse || "") ? "Condo" : "Single Family", demo: {} }) })}</div>
    <p class="tp-addr">${esc(p.address)}</p>
    <p class="muted tp-sub">${esc(p.county)} County · Parcel ${esc(pc.ParcelId || "—")}${p.building ? " · building record (add a unit # for a specific unit)" : ""}</p>
    ${match ? `<a class="btn btn-ghost tp-full" href="#/home/${esc(match.ListingId)}" target="_blank" rel="noopener">See the full Toured listing ↗</a>` : ""}

    <h3 class="tp-h">Tour reviews</h3>
    ${reviewsOff ? `<p class="muted">Reviews are turned off for this home at the seller's request.</p>` : `
      ${s ? `<div class="tp-score"><b>${s.avg.toFixed(1)}</b> ${stars(s.avg)} <span class="muted">${s.count} verified tour${s.count > 1 ? "s" : ""}</span></div>` : `<p class="muted">No tour reviews yet.</p>`}
      ${mine ? "" : `<button class="btn" type="button" data-tp="review">Toured it? Write a review</button>`}
      <div class="tp-reviews">${reviews.slice(0, 3).map(reviewHTML).join("")}</div>
      ${reviews.length > 3 ? `<p class="muted" style="font-size:13px">+ ${reviews.length - 3} more review${reviews.length - 3 > 1 ? "s" : ""}</p>` : ""}`}

    <h3 class="tp-h">Public records &amp; taxes</h3>
    <p class="not-mls">County property records · not from BeachesMLS</p>
    <div class="tp-facts">${facts.map(([k, v]) => `<div><small>${k}</small><div>${v}</div></div>`).join("")}</div>
    <div class="tp-links">
      ${taxBillLink(p.county, pc.ParcelId) ? `<a class="btn" href="${esc(taxBillLink(p.county, pc.ParcelId))}" target="_blank" rel="noopener noreferrer">Tax bills &amp; payment status ↗</a>` : ""}
      ${pc.Links?.appraiser ? `<a class="btn btn-ghost" href="${esc(pc.Links.appraiser)}" target="_blank" rel="noopener noreferrer">Owner &amp; full property record ↗</a>` : ""}
    </div>
    ${p.county === "Palm Beach" ? pbcTaxHint(pc.ParcelId) : ""}

    <div class="tp-agent">
      <p><b>Want to see it in person?</b><br>A licensed local agent will reach out, usually within the hour.</p>
      <button class="btn" type="button" data-tp="tour">Request a tour</button>
    </div>
    <button type="button" class="linkbtn" data-tp="clear">← Look up another home</button>
  </div>`;
}

function panelClick(e) {
  const home = e.target.closest(".tp-home");
  if (home) {
    const l = S.byId.get(home.dataset.key);
    if (l) { window.open(`#/home/${l.ListingId}`, "_blank", "noopener"); return; }
    $("#tpAddr").value = home.dataset.address;
    panelLookup(home.dataset.address, home.dataset.key);
    return;
  }
  const act = e.target.closest("[data-tp]")?.dataset.tp;
  const p = panel.property;
  if (act === "clear") { $("#tpAddr").value = ""; renderPanelHome(); $("#tpAddr").focus(); }
  if (act === "review" && p) requireAuth(() => openReviewForm(panelListing(p)));
  if (act === "tour" && p) {
    contactAgent(`Tour request: ${p.address}`, `I'd like to tour ${p.address}.`, p.address);
  }
  const h = e.target.closest("[data-helpful]");
  if (h && p && store.isRemote() && !S.user) { requireAuth(() => renderPanelProperty(p)); return; }
  if (h && p) { if (store.markHelpful(h.dataset.helpful)) { renderPanelProperty(p); toast("Thanks for the feedback"); } else toast("You already marked this helpful"); }
  const del = e.target.closest("[data-delete]");
  if (del && p && confirm("Delete your review?")) store.deleteReview(del.dataset.delete, S.user).then(() => { renderPanelProperty(p); toast("Review deleted"); });
}
// Demo listings only: opens the listing straight into Zillow's full-screen photo viewer
// (?mmlb=g,0) instead of the listing page. Photos stay hosted on Zillow.
const photoGalleryUrl = (l) => `${l.SourceUrl}?mmlb=g,0`;

/* ---------------- public records (FL Dept. of Revenue parcel data) ---------------- */
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function saleText(sale) {
  if (!sale) return "—";
  return `${fmt$(sale.price)} · ${sale.month ? MONTHS[sale.month] + " " : ""}${sale.year}${sale.qualified ? "" : ` <span class="muted" style="font-size:12px">(non-arm's-length)</span>`}`;
}
function publicRecordsHTML(l) {
  const mls = isMls(l);
  const st = mls ? S.details.get(l.ListingId)?.parcelStatus : "matched";
  const p = l.Parcel;
  if (p) setTimeout(() => loadHistoryFor(l), 0);
  const label = mls ? `<p class="not-mls">County property records · not from BeachesMLS</p>` : "";
  const search = { Broward: "https://web.bcpa.net/BcpaClient/#/Record-Search", "Palm Beach": "https://pbcpao.gov/", "St. Lucie": "https://apps.paslc.gov/property-search/" }[l.County];
  const taxSearch = taxBillLink(l.County, "");
  if (mls && (st === undefined || st === "pending")) {
    return `<section class="section" id="records"><h2>Public records &amp; taxes</h2>${label}
      <p class="muted">${st === "pending" ? "County records are taking longer than usual to load. Check back in a few minutes." : "Loading public records…"}</p></section>`;
  }
  if (!p) {
    return `<section class="section" id="records"><h2>Public records &amp; taxes</h2>${label}
      <p class="muted">We couldn't match this listing to its county parcel automatically. You can look it up by address:</p>
      <div class="records-links">
        ${taxSearch ? `<a class="btn" href="${esc(taxSearch)}" target="_blank" rel="noopener noreferrer">Search ${esc(l.County)} tax bills ↗</a>` : ""}
        ${search ? `<a class="btn btn-ghost" href="${esc(search)}" target="_blank" rel="noopener noreferrer">Search the property appraiser ↗</a>` : ""}
      </div></section>`;
  }
  const showOwner = p.Owner && (!mls || SITE.showOwnerOnMlsListings);
  const listVsJust = p.JustValue ? Math.round(((l.ListPrice - p.JustValue) / p.JustValue) * 100) : null;
  const rows = [
    showOwner && ["Owner of record", esc(p.Owner)],
    ["Parcel ID", `<span style="font-variant-numeric:tabular-nums">${esc(p.ParcelId)}</span>`],
    ["Land use", esc(p.LandUse)],
    ["Market (just) value", `${fmt$(p.JustValue)}${listVsJust != null ? ` <span class="muted" style="font-size:12px">· list price is ${Math.abs(listVsJust)}% ${listVsJust >= 0 ? "above" : "below"}</span>` : ""}`],
    ["Assessed value", fmt$(p.AssessedValue)],
    ["Taxable value", fmt$(p.TaxableValueNonSchool)],
    ["Land value", fmt$(p.LandValue)],
    ["Homestead exemption", p.Homestead ? "Yes" : "No"],
    ["Year built (actual / effective)", `${p.YearBuilt || "—"} / ${p.EffectiveYearBuilt || "—"}`],
    ["Living area (county)", p.LivingAreaSqFt ? `${fmtN(p.LivingAreaSqFt)} sqft <span class="muted" style="font-size:12px">· listing says ${fmtN(l.LivingArea)}</span>` : "—"],
  ].filter(Boolean);
  const h = l.History; // county appraiser data, loaded after the parcel (see loadHistoryFor)
  const t = taxEstimates(l, p, h);
  const lastMarket = h?.sales?.find((x) => x.armsLength) || h?.sales?.find((x) => x.marketSale);
  if (h) rows.push(["Last sale", lastMarket ? `${fmt$(lastMarket.price)} · ${fmtMonthYear(lastMarket.date)}` : "No market sale on record"]);
  else rows.push(["Last sale", saleText(p.LastSale)]);
  return `<section class="section" id="records">
    <h2>Public records &amp; taxes</h2>
    ${label}
    <div class="records-grid">${rows.map(([k, v]) => `<div><small>${k}</small><div>${v}</div></div>`).join("")}</div>
    <div class="tax-compare">
      <div><small>Current owner's taxes</small><b>${fmt$(t.current)}/yr</b>
        <span class="muted">${esc(t.currentNote)} · ${t.currentHomestead ? "with homestead exemption" : "no homestead exemption"}</span></div>
      <div><small>Est. taxes after you buy</small><b>${fmt$(t.afterBuy)}/yr</b>
        <span class="muted">About ${fmt$(t.afterBuyHomestead)}/yr if it's your primary home (homestead)</span></div>
    </div>
    <p class="muted tax-why">After a sale the county resets the taxable value, so the seller's capped value and exemptions don't carry over.
      This estimate uses ${fmt$(t.newTaxable)} (the higher of the county's market value or 85% of the price) at ${t.millage.toFixed(2)} mills${t.exactMillage ? "" : " (approx.)"}${t.fixed ? ` plus ${fmt$(t.fixed)} in fixed county charges` : ""}.</p>
    ${saleHistoryHTML(h)}
    <div class="records-links">
      ${taxBillLink(l.County, p.ParcelId) ? `<a class="btn" href="${esc(taxBillLink(l.County, p.ParcelId))}" target="_blank" rel="noopener noreferrer">Tax bills &amp; payment status ↗</a>` : ""}
      ${p.Links?.appraiser ? `<a class="btn btn-ghost" href="${esc(p.Links.appraiser)}" target="_blank" rel="noopener noreferrer">${showOwner ? `${esc(l.County)} property appraiser ↗` : "Owner &amp; full property record ↗"}</a>` : ""}
    </div>
    ${l.County === "Palm Beach" ? pbcTaxHint(p.ParcelId) : ""}
    <p class="muted" style="font-size:12px;margin-top:10px">Source: ${esc(String(p.AssessmentYear))} county property tax roll (published statewide by the Florida Department of Revenue), matched to this listing by location and address. Tax estimates use the county's actual tax rate when available (otherwise an approximate rate) and don't include the buyer's own exemptions beyond homestead; the tax collector link shows the actual bills and whether they've been paid. Check for unpaid taxes or tax certificates before closing.${showOwner ? "" : " The owner of record is shown on the county property appraiser's site."}</p>
  </section>`;
}
const fmtMonthYear = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");
function saleHistoryHTML(h) {
  if (!h?.sales?.length) return "";
  return `<div class="sale-history"><h3>Sale history</h3>
    <table><thead><tr><th>Date</th><th class="num">Price</th><th>Type</th></tr></thead><tbody>
    ${h.sales.slice(0, 6).map((x) => `<tr class="${x.marketSale ? "" : "nonsale"}"><td>${esc(fmtMonthYear(x.date))}</td>
      <td class="num">${x.marketSale ? fmt$(x.price) : x.price ? `<span title="Nominal amount on a non-sale transfer">${fmt$(x.price)}</span>` : "—"}</td>
      <td>${esc(x.marketSale ? (x.armsLength ? "Sale" : "Sale (not arm's-length)") : "Transfer, not a sale")}${x.type ? ` <span class="muted">· ${esc(titleCase(x.type))}</span>` : ""}</td></tr>`).join("")}
    </tbody></table>
    <p class="muted" style="font-size:12px">From the county property appraiser. Recent sales can take a few weeks to appear.</p></div>`;
}
// Load the county appraiser's sale history and actual bill, then redraw the records section.
function loadHistoryFor(l) {
  const p = l.Parcel;
  if (!p?.ParcelId || l.History !== undefined || !["Broward", "Palm Beach"].includes(l.County)) return;
  l.History = null;
  store.loadHistory(l.County, p.ParcelId).then((h) => {
    if (!h) return;
    l.History = h;
    const sec = $("#records");
    if (sec && location.hash === `#/home/${l.ListingId}`) sec.outerHTML = publicRecordsHTML(l);
  });
}
// Palm Beach's tax site can't open one parcel by link: show the number with a copy button.
function pbcTaxHint(parcelId) {
  const pcn = formatPcn(parcelId);
  return `<p class="pbc-hint">Palm Beach's tax site opens to a search: paste parcel <b>${esc(pcn)}</b>
    <button type="button" class="linkbtn" data-copy="${esc(String(parcelId || "").replace(/\D/g, ""))}">Copy</button></p>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast("Parcel number copied"); }
  catch { toast(`Parcel number: ${b.dataset.copy}`); }
});
const fmtTime = (hm) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`; };
const addHours = (hm, n) => { const [h, m] = hm.split(":").map(Number); return `${h + n}:${String(m).padStart(2, "0")}`; };

function reviewSummaryHTML(s) {
  if (!s) return "";
  return `<div class="reviews-head">
    <div>
      <div class="score-big">${s.avg.toFixed(1)}</div>
      ${stars(s.avg)}
      <p class="muted" style="margin-top:4px">${s.count} verified tour${s.count > 1 ? "s" : ""}</p>
    </div>
    <div class="cat-bars">
      ${store.RATING_CATEGORIES.filter((c) => c.key !== "overall" && s.cats[c.key] != null).map((c) =>
        `<div class="cat-bar"><span>${c.label}</span><span class="track"><span class="fill" style="width:${(s.cats[c.key] / 5) * 100}%"></span></span><b>${s.cats[c.key].toFixed(1)}</b></div>`).join("")}
    </div>
  </div>`;
}

function reviewHTML(r) {
  const isMine = S.user && r.userId === S.user.id;
  return `<article class="review">
    <div class="review-top">
      <span class="avatar" aria-hidden="true">${esc(r.displayName.slice(0, 1).toUpperCase())}</span>
      <div>
        <b>${esc(r.displayName)}</b> ${r.sample ? `<span class="sample-flag">Sample</span>` : ""}
        <div class="review-meta">Toured ${fmtDate(r.tour.date)} · ${esc(store.TOUR_TYPES[r.tour.type] || r.tour.type)} · Posted ${fmtDate(r.createdAt.slice(0, 10))}</div>
      </div>
      <span class="verified-pill" title="The reviewer certified they toured this home in person">${CHECK} Certified tour</span>
    </div>
    <div style="margin-top:8px">${stars(r.ratings.overall)}</div>
    <h4>${esc(r.title)}</h4>
    <p>${esc(r.body)}</p>
    ${r.pros || r.cons ? `<div class="pros-cons">${r.pros ? `<div class="pro"><b>Liked</b>${esc(r.pros)}</div>` : ""}${r.cons ? `<div class="con"><b>Watch out for</b>${esc(r.cons)}</div>` : ""}</div>` : ""}
    ${r.tags?.length ? `<div class="review-tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <div class="helpful">
      <button type="button" data-helpful="${r.id}">👍 Helpful${r.helpful ? ` (${r.helpful})` : ""}</button>
      ${isMine ? `<button type="button" class="linkbtn" data-delete="${r.id}">Delete</button>` : ""}
    </div>
  </article>`;
}

/* ---------------- mortgage calc ---------------- */
function renderCalc(l) {
  const el = $("#calc");
  const st = { down: 20, rate: 6.4, years: 30 };
  const draw = () => {
    const { pi, tax, ins, flood, hoa, total } = monthlyCost(l, { ...st, useListingTax: true });
    const parts = [["Principal & interest", pi, "#0b6e63"], ["Property tax", tax, "#5aa6c9"], ["Home insurance", ins, "#f2a516"], ["Flood insurance", flood, "#7a5af5"], ["HOA", hoa, "#e8563f"]].filter((p) => p[1] > 0);
    $(".total", el).textContent = fmt$(total) + "/mo";
    $(".bar", el).innerHTML = parts.map(([, v, c]) => `<span style="width:${(v / total) * 100}%;background:${c}"></span>`).join("");
    $(".legend", el).innerHTML = parts.map(([k, v, c]) => `<span><i style="background:${c}"></i>${k}: ${fmt$(v)}</span>`).join("");
  };
  el.innerHTML = `<h3>Monthly cost estimate</h3><div class="total"></div><div class="bar"></div><div class="legend"></div>
    <div style="margin-top:12px">
      <label>Down payment (%)<input type="number" min="0" max="100" step="1" value="${st.down}" data-k="down"></label>
      <label>Interest rate (%)<input type="number" min="0" max="20" step="0.05" value="${st.rate}" data-k="rate"></label>
      <label>Loan term (yrs)<input type="number" min="5" max="40" step="5" value="${st.years}" data-k="years"></label>
    </div>`;
  el.addEventListener("input", (e) => { const k = e.target.dataset.k; if (!k) return; const v = parseFloat(e.target.value); if (Number.isFinite(v)) { st[k] = v; draw(); } });
  draw();
}

/* ---------------- review form ---------------- */
function openReviewForm(l) {
  const form = $("#reviewForm");
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  if (S.user && store.getReviews(l.ListingId).some((r) => r.userId === S.user.id)) { toast("You've already reviewed this home."); (l.onReviewChange || renderDetail)(l); return; }
  form.innerHTML = `
    <h2 id="reviewTitle">Review your tour</h2>
    <p class="muted">${esc(l.UnparsedAddress)}</p>
    <div class="field-row">
      <label class="field">Date you toured<input type="date" name="tourDate" required max="${today}" min="${minDate}" value="${today}"></label>
      <label class="field">How you toured<select name="tourType" required>
        ${Object.entries(store.TOUR_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
      </select></label>
    </div>
    <div class="rate-grid">
      ${store.RATING_CATEGORIES.map((c) => `<div class="rate-row"><span>${c.label}${c.key === "overall" ? " *" : ""}</span>
        <span class="star-input" role="radiogroup" aria-label="${c.label}">
          ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="r-${c.key}-${n}" name="rate-${c.key}" value="${n}"><label for="r-${c.key}-${n}" title="${n} star${n > 1 ? "s" : ""}">★</label>`).join("")}
        </span></div>`).join("")}
    </div>
    <label class="field">Headline<input name="title" maxlength="80" required placeholder="e.g. Exactly like the photos, but the street is busy"></label>
    <label class="field">Your tour, in detail<textarea name="body" maxlength="2000" required placeholder="What did you notice in person that the listing doesn't show? Condition, smells, noise, light, layout, neighbors…"></textarea></label>
    <div class="field-row">
      <label class="field">What you liked<input name="pros" maxlength="140"></label>
      <label class="field">Watch out for<input name="cons" maxlength="140"></label>
    </div>
    <div class="field">Quick tags
      <div class="tag-pick">${store.REVIEW_TAGS.map((t, i) => `<input type="checkbox" id="tg${i}" name="tags" value="${esc(t)}"><label for="tg${i}">${esc(t)}</label>`).join("")}</div>
    </div>
    <label class="certify"><input type="checkbox" name="certified" required>
      <span>I certify that I personally toured <b>${esc(l.StreetAddress)}</b> in person on the date above, that this review reflects my own experience, and that I am not the owner, listing agent, or affiliated with the seller.</span></label>
    <div class="form-error" id="reviewErr" role="alert"></div>
    <div class="modal-actions">
      <button class="linkbtn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="ok">Post review</button>
    </div>`;
  form.onsubmit = async (e) => {
    if (e.submitter?.value !== "ok") return;
    e.preventDefault();
    const fd = new FormData(form);
    const ratings = {};
    for (const c of store.RATING_CATEGORIES) { const v = fd.get(`rate-${c.key}`); if (v) ratings[c.key] = Number(v); }
    const input = {
      tourDate: fd.get("tourDate"), tourType: fd.get("tourType"), ratings,
      title: fd.get("title"), body: fd.get("body"), pros: fd.get("pros"), cons: fd.get("cons"),
      tags: fd.getAll("tags"), certified: fd.get("certified") === "on",
    };
    try {
      await store.addReview(input, { listing: l, user: S.user });
      $("#reviewModal").close();
      S.summaries = store.getReviewSummaries();
      if (l.onReviewChange) l.onReviewChange(l);
      else { renderDetail(l); $("#reviewList").scrollIntoView({ behavior: "smooth" }); }
      toast("Review posted — thanks for helping other buyers");
    } catch (err) {
      $("#reviewErr").innerHTML = (err.errors || [err.message]).map(esc).join("<br>");
    }
  };
  $("#reviewModal").showModal();
}

/* ---------------- saved / my reviews ---------------- */
function renderSaved() {
  const rows = S.listings.filter((l) => S.saved.has(l.ListingId));
  $("#view-saved").innerHTML = `<h1>Saved homes</h1><p class="muted" style="margin-bottom:18px">${rows.length} saved · stored in this browser</p>
    ${rows.length ? `<div class="cards">${rows.map((l) => cardHTML(l)).join("")}</div>` : `<div class="empty"><h2>Nothing saved yet</h2><p>Tap the heart on any home to keep it here.</p><a class="btn" href="#/" style="text-decoration:none;display:inline-block">Browse homes</a></div>`}`;
}
function renderMyReviews() {
  const el = $("#view-myreviews");
  if (!S.user) {
    el.innerHTML = `<h1>My tour reviews</h1><div class="empty"><h2>Sign in to see your reviews</h2><p>Only signed-in users who certify they toured a home can review it.</p><button class="btn" type="button" id="myIn">Sign in</button></div>`;
    $("#myIn").onclick = () => requireAuth(() => renderMyReviews());
    return;
  }
  const rows = store.getReviewsByUser(S.user.id);
  el.innerHTML = `<h1>My tour reviews</h1><p class="muted" style="margin-bottom:18px">Signed in as ${esc(S.user.displayName)}</p>
    ${rows.length ? rows.map((r) => { const l = S.byId.get(r.listingId); return `<div class="side-card" style="position:static;margin-bottom:14px"><a href="#/home/${r.listingId}"><b>${esc(l?.UnparsedAddress || r.listingId)}</b></a>${reviewHTML(r)}</div>`; }).join("")
      : `<div class="empty"><h2>No reviews yet</h2><p>Open a home you've toured and choose “I toured this home”.</p><a class="btn" href="#/" style="text-decoration:none;display:inline-block">Find a home</a></div>`}`;
}
