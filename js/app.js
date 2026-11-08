import * as store from "./store.js";
import {
  PRICE_STEPS, SQFT_STEPS, LOT_STEPS, LOT_LABELS, HOME_TYPES, SEGMENTS, DRAWER_KEYS,
  defaults, matches, sortListings, toQuery, fromQuery, chipsFor, shortMoney,
} from "./filters.js";
import { houseSVG, typeIcon } from "./art.js";

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
};

/* ---------------- boot ---------------- */
init().catch((e) => {
  console.error(e);
  $("#cards").innerHTML = `<div class="empty"><h2>Couldn't load listings</h2><p>${esc(e.message)}. If you opened index.html directly, serve the folder instead (e.g. <code>npx serve .</code>).</p></div>`;
});

async function init() {
  S.listings = await store.loadListings();
  S.listings.forEach((l) => S.byId.set(l.ListingId, l));
  buildControls();
  initMap();
  renderAccount();
  store.onAuthChange((u) => { S.user = u; renderAccount(); route(); });
  wireEvents();
  syncControls();
  observeSearchbar();
  window.addEventListener("hashchange", route);
  route();
}

/* ---------------- controls ---------------- */
function fillSelect(sel, steps, { min, label = shortMoney } = {}) {
  sel.innerHTML = `<option value="">${min ? "No min" : "No max"}</option>` +
    steps.filter((v) => v > 0).map((v) => `<option value="${v}">${label(v)}</option>`).join("");
}

function buildControls() {
  fillSelect($("[name=priceMin]"), PRICE_STEPS, { min: true });
  fillSelect($("[name=priceMax]"), PRICE_STEPS);
  fillSelect($("[name=sqftMin]"), SQFT_STEPS, { min: true, label: (v) => fmtN(v) + " sqft" });
  fillSelect($("[name=sqftMax]"), SQFT_STEPS, { label: (v) => fmtN(v) + " sqft" });
  fillSelect($("[name=lotMin]"), LOT_STEPS, { min: true, label: (v) => LOT_LABELS[v] });
  fillSelect($("[name=lotMax]"), LOT_STEPS, { label: (v) => LOT_LABELS[v] });

  for (const el of $$("[data-seg]")) {
    const key = el.dataset.seg;
    el.innerHTML = SEGMENTS[key].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join("");
  }
  $("#typeGrid").innerHTML = HOME_TYPES.map((t) =>
    `<label><input type="checkbox" name="type" value="${t}" />${typeIcon(t)}${t}</label>`).join("");

  const places = new Set();
  S.listings.forEach((l) => { places.add(l.Neighborhood); places.add(l.City); places.add(l.PostalCode); });
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
    else if (el.type === "checkbox") el.checked = !!f[el.name];
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
  setPill("type", f.types.length ? (f.types.length === 1 ? f.types[0] : `Home type (${f.types.length})`) : "Home type", f.types.length > 0);
  const st = !(f.statusActive && f.statusContingent && !f.statusPending);
  setPill("status", st ? (f.statusPending ? "Incl. pending" : "Status (custom)") : "For sale", st);
  const d = defaults();
  const moreN = DRAWER_KEYS.filter((k) => f[k] !== d[k] && f[k] !== "").length;
  $("#moreCount").hidden = !moreN; $("#moreCount").textContent = moreN;
  $("#moreBtn").classList.toggle("is-set", moreN > 0);
  $("#boundsToggle").checked = !!f.bounds;
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
    if (el.name === "type") return setFilters({ types: $$("[name=type]:checked").map((i) => i.value) });
    if (el.type === "checkbox") return setFilters({ [el.name]: el.checked });
    if (el.name === "keyword") return setFilters({ keyword: el.value.trim() });
    const v = el.value === "" ? null : Number(el.value);
    setFilters({ [el.name]: Number.isFinite(v) ? v : null });
  };
  $("#filterbar").addEventListener("change", onInput);
  $("#moreForm").addEventListener("change", onInput);
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
    $("#mobileMapBtn").textContent = on ? "List" : "Map";
    setTimeout(() => map?.invalidateSize(), 50);
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
    if (e.submitter?.value !== "ok") return;
    const fd = new FormData(e.target);
    await store.signIn({ displayName: fd.get("displayName"), email: fd.get("email") });
    toast(`Signed in as ${fd.get("displayName")}`);
    if (authThen) { const fn = authThen; authThen = null; fn(); }
  });
  $("#authModal").addEventListener("close", () => { if ($("#authModal").returnValue !== "ok") authThen = null; });
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
  }).observe(sb);
}

/* ---------------- auth ---------------- */
let authThen = null;
function requireAuth(then) {
  if (S.user) return then();
  authThen = then;
  $("#authForm").reset();
  $("#authModal").showModal();
}
function renderAccount() {
  const el = $("#account");
  if (S.user) {
    const initials = S.user.displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
    el.innerHTML = `<span class="avatar" title="${esc(S.user.email)}">${esc(initials)}</span><button class="linkbtn" id="signOut" type="button">Sign out</button>`;
    $("#signOut").onclick = () => { store.signOut(); toast("Signed out"); };
  } else {
    el.innerHTML = `<button class="btn btn-ghost" id="signIn" type="button">Sign in</button>`;
    $("#signIn").onclick = () => requireAuth(() => {});
  }
}

/* ---------------- map ---------------- */
let map, markerLayer, markers = new Map(), miniMap;
function initMap() {
  if (!window.L) { // map library failed to load: keep search usable without it
    $("#map").innerHTML = `<p class="muted" style="padding:20px">Map unavailable.</p>`;
    map = null; return;
  }
  map = L.map("map", { zoomControl: true, preferCanvas: false }).setView([27.98, -82.5], 11);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd", maxZoom: 19,
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
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
    m.addTo(markerLayer);
    markers.set(l.ListingId, m);
  }
  if (fit && rows.length) map.fitBounds(L.latLngBounds(rows.map((l) => [l.Latitude, l.Longitude])), { padding: [40, 40], maxZoom: 14 });
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
    <div class="card-media">${houseSVG(l)}<div class="badges">${badgesFor(l)}</div>
      ${compact ? "" : `<button class="save-btn" type="button" data-id="${l.ListingId}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save home"}">${HEART}</button>`}
    </div>
    <div class="card-body">
      <div class="price">${fmt$(l.ListPrice)}${l.demo.PriceReduced && !compact ? `<s>${fmt$(l.demo.OriginalListPrice)}</s>` : ""}</div>
      <div class="facts"><span><b>${l.BedroomsTotal}</b> bd</span><span><b>${l.BathroomsTotalInteger}</b> ba</span><span><b>${fmtN(l.LivingArea)}</b> sqft</span>${compact ? "" : `<span>${l.PropertyType}</span>`}</div>
      <p class="addr">${esc(l.UnparsedAddress)}</p>
      ${compact ? `<div style="margin-top:6px">${rating}</div>` : `<div class="card-foot">${rating}<span class="office" title="${esc(l.ListOfficeName)}">${esc(l.ListOfficeName)}</span></div>`}
    </div>
  </a>`;
}

function renderResults({ fitMap = false } = {}) {
  S.summaries = store.getReviewSummaries();
  const rows = sortListings(S.listings.filter((l) => matches(l, S.f, S.summaries[l.ListingId])), S.f.sort, S.summaries);
  S.results = rows;
  const cards = $("#cards");
  cards.innerHTML = rows.slice(0, 200).map((l) => cardHTML(l)).join("");
  $("#empty").hidden = rows.length > 0;
  const reviewed = rows.filter((l) => S.summaries[l.ListingId]).length;
  $("#resultCount").textContent = `${rows.length} home${rows.length === 1 ? "" : "s"}${reviewed ? ` · ${reviewed} with verified-tour reviews` : ""}`;
  $("#listTitle").textContent = S.f.q ? `${titleCase(S.f.q)} homes for sale` : "Tampa Bay homes for sale";
  $("#chips").innerHTML = chipsFor(S.f).map((c) =>
    `<button class="chip" type="button" data-clear='${esc(JSON.stringify(c.clear))}' aria-label="Remove filter ${esc(c.label)}">${esc(c.label)} <b>✕</b></button>`).join("");
  renderMarkers(rows, fitMap);
}
const titleCase = (s) => s.replace(/\b\w/g, (m) => m.toUpperCase());

/* ---------------- routing ---------------- */
function show(id) {
  for (const v of ["view-search", "view-detail", "view-saved", "view-myreviews"]) $("#" + v).hidden = v !== id;
  $(".searchbar").hidden = id !== "view-search";
  $$(".mainnav a").forEach((a) => a.classList.toggle("is-active",
    (id === "view-search" && a.getAttribute("href") === "#/") ||
    (id === "view-saved" && a.getAttribute("href") === "#/saved") ||
    (id === "view-myreviews" && a.getAttribute("href") === "#/my-reviews")));
}
let firstSearchRender = true;
function route() {
  const h = location.hash || "#/";
  const m = h.match(/^#\/home\/(\w+)/);
  if (m && S.byId.has(m[1])) { show("view-detail"); renderDetail(S.byId.get(m[1])); window.scrollTo(0, 0); return; }
  if (h === "#/saved") { show("view-saved"); renderSaved(); return; }
  if (h === "#/my-reviews") { show("view-myreviews"); renderMyReviews(); return; }
  show("view-search");
  document.title = "Toured — Homes reviewed by people who walked through";
  renderResults({ fitMap: firstSearchRender && !S.f.bounds });
  firstSearchRender = false;
  setTimeout(() => map?.invalidateSize(), 0);
}

/* ---------------- detail ---------------- */
function renderDetail(l) {
  const d = l.demo;
  const reviews = store.getReviews(l.ListingId);
  const s = S.summaries[l.ListingId];
  const saved = S.saved.has(l.ListingId);
  const mine = S.user && reviews.find((r) => r.userId === S.user.id);
  document.title = `${l.StreetAddress} — ${fmt$(l.ListPrice)} | Toured`;
  const est = `<span class="est" title="Placeholder until an MLS feed is connected">est.</span>`;
  const statusDot = d.StandardStatus === "Active" ? "" : "pending";

  const keyFacts = [
    ["Property type", l.PropertyType],
    ["Year built", d.YearBuilt + " " + est],
    ["Lot size", d.LotSizeSquareFeet ? `${fmtN(d.LotSizeSquareFeet)} sqft ${est}` : "—"],
    ["Price / sqft", fmt$(l.PricePerSqFt)],
    ["HOA", (d.AssociationFee ? `${fmt$(d.AssociationFee)}/mo` : "None") + " " + est],
    ["Garage", (d.GarageSpaces ? `${d.GarageSpaces} space${d.GarageSpaces > 1 ? "s" : ""}` : "None") + " " + est],
    ["Stories", d.StoriesTotal + " " + est],
    ["Days listed", d.DaysOnMarket + " " + est],
    ["Est. annual tax", fmt$(d.TaxAnnualAmount) + " " + est],
    ["Style", d.ArchitecturalStyle + " " + est],
  ];
  const features = [
    d.PoolPrivateYN && "Private pool", d.WaterfrontYN && "Waterfront", d.View && `${d.View} view`,
    d.FireplaceYN && "Fireplace", d.CentralAir && "Central air", d.GatedCommunity && "Gated community",
    d.SolarPanels && "Solar panels", d.EVCharging && "EV charging", d.VirtualTour && "Virtual tour available",
    d.NewConstructionYN && "New construction", d.SeniorCommunityYN && "55+ community",
  ].filter(Boolean);

  $("#view-detail").innerHTML = `
    <div class="crumbs">
      <a class="linkbtn" href="#/" data-back>← Back to search</a>
      <button class="save-btn" style="position:static" type="button" data-id="${l.ListingId}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save home"}">${HEART}</button>
    </div>
    <div class="gallery">
      <div>${houseSVG(l)}<span class="gallery-note">Illustration · listing photos load from the MLS feed</span></div>
      <div>${houseSVG(l, { variant: 1, label: "Illustration" })}</div>
      <div>${houseSVG(l, { variant: 2, label: "Illustration" })}</div>
    </div>
    <div class="detail-grid">
      <div>
        <div class="badges" style="position:static;margin-bottom:8px">${badgesFor(l)}</div>
        <p class="d-price">${fmt$(l.ListPrice)}${d.PriceReduced ? ` <s style="font-size:16px;color:var(--ink-3);font-weight:500">${fmt$(d.OriginalListPrice)}</s>` : ""}</p>
        <div class="d-facts"><span><b>${l.BedroomsTotal}</b> beds</span><span><b>${l.BathroomsTotalInteger}</b> baths</span><span><b>${fmtN(l.LivingArea)}</b> sqft</span></div>
        <p class="d-addr">${esc(l.UnparsedAddress)}</p>
        <div class="status-line">
          <span><span class="dot ${statusDot}"></span> ${d.StandardStatus} ${est}</span>
          <span>·</span><span>${esc(l.Neighborhood)}</span>
          ${s ? `<span>·</span><a href="#reviews" class="rating-mini" style="text-decoration:none;color:inherit"><span class="star">★</span>${s.avg.toFixed(1)} <span class="n">(${s.count} verified tour${s.count > 1 ? "s" : ""})</span></a>` : ""}
        </div>
        ${d.OpenHouse ? `<div class="cta-review" style="background:#fff;border:1.5px solid var(--line)"><p><b>Open house</b> · ${weekday(d.OpenHouse.date)}, ${fmtTime(d.OpenHouse.start)}–${fmtTime(addHours(d.OpenHouse.start, d.OpenHouse.durationHrs))} ${est}</p><span class="muted">Tour it, then come back to review it</span></div>` : ""}

        <section class="section" id="reviews">
          <h2>Tour reviews</h2>
          ${reviewSummaryHTML(s)}
          <div class="cta-review">
            <p>${mine ? "Thanks — you've reviewed this home." : "Toured this home? Share what the listing doesn't tell you."}</p>
            ${mine ? "" : `<button class="btn" type="button" id="writeReview">Write a tour review</button>`}
          </div>
          <div id="reviewList">${reviews.length ? reviews.map(reviewHTML).join("") : `<p class="muted" style="padding:12px 0">No reviews yet. Reviews can only be written by signed-in users who certify they toured the home in person.</p>`}</div>
        </section>

        <section class="section">
          <h2>About this home</h2>
          <p>${esc(d.PublicRemarks)}</p>
        </section>
        <section class="section">
          <h2>Key facts</h2>
          <div class="keyfacts">${keyFacts.map(([k, v]) => `<div class="kf"><div><small>${k}</small><strong>${v}</strong></div></div>`).join("")}</div>
        </section>
        ${features.length ? `<section class="section"><h2>Features ${est}</h2><ul class="feature-list">${features.map((x) => `<li>${x}</li>`).join("")}</ul></section>` : ""}
        <section class="section">
          <h2>Location</h2>
          <div class="mini-map" id="miniMap"></div>
        </section>
        <section class="section" style="border:0">
          <p class="muted" style="font-size:13px">Listed by <b>${esc(l.ListOfficeName)}</b>. Listing facts retrieved ${fmtDate(l.SourceRetrieved)} from public listing data (<a href="${esc(l.SourceUrl)}" target="_blank" rel="noopener noreferrer">source</a>). Fields marked ${est} are placeholders. Toured is not affiliated with the listing broker; tour reviews are user opinions.</p>
        </section>
      </div>
      <aside>
        <div class="side-card">
          <h3>Interested in this home?</h3>
          <p class="muted" style="font-size:14px">Request a showing — after you tour, you'll be able to leave a verified review.</p>
          <button class="btn" type="button" id="reqTour">Request a tour</button>
          <button class="btn btn-ghost" type="button" style="margin-top:8px" id="sideReview">${mine ? "View your review" : "I toured this home"}</button>
        </div>
        <div class="side-card calc" id="calc"></div>
      </aside>
    </div>`;

  $("#writeReview")?.addEventListener("click", () => requireAuth(() => openReviewForm(l)));
  $("#sideReview").addEventListener("click", () => mine ? $("#reviewList").scrollIntoView({ behavior: "smooth" }) : requireAuth(() => openReviewForm(l)));
  $("#reqTour").addEventListener("click", () => toast("Tour requests will connect to an agent / showing service."));
  $("#reviewList").addEventListener("click", async (e) => {
    const h = e.target.closest("[data-helpful]");
    if (h) { if (store.markHelpful(h.dataset.helpful)) { renderDetail(l); toast("Thanks for the feedback"); } else toast("You already marked this helpful"); }
    const del = e.target.closest("[data-delete]");
    if (del && confirm("Delete your review?")) { await store.deleteReview(del.dataset.delete, S.user); S.summaries = store.getReviewSummaries(); renderDetail(l); toast("Review deleted"); }
  });
  renderCalc(l);

  if (!window.L) return;
  if (miniMap) miniMap.remove();
  miniMap = L.map("miniMap", { scrollWheelZoom: false }).setView([l.Latitude, l.Longitude], 15);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19,
  }).addTo(miniMap);
  L.marker([l.Latitude, l.Longitude], { icon: L.divIcon({ className: "pin-icon", html: `<div class="pin">${pinPrice(l.ListPrice)}</div>`, iconSize: [0, 0] }) }).addTo(miniMap);
}
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
    const loan = l.ListPrice * (1 - st.down / 100);
    const r = st.rate / 100 / 12, n = st.years * 12;
    const pi = r ? (loan * r) / (1 - (1 + r) ** -n) : loan / n;
    const tax = l.demo.TaxAnnualAmount / 12;
    const ins = (l.ListPrice * 0.009) / 12; // FL homeowners insurance is high
    const hoa = l.demo.AssociationFee;
    const total = pi + tax + ins + hoa;
    const parts = [["Principal & interest", pi, "#0b6e63"], ["Property tax", tax, "#5aa6c9"], ["Home insurance", ins, "#f2a516"], ["HOA", hoa, "#e8563f"]].filter((p) => p[1] > 0);
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
  if (S.user && store.getReviews(l.ListingId).some((r) => r.userId === S.user.id)) { toast("You've already reviewed this home."); renderDetail(l); return; }
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
      renderDetail(l);
      $("#reviewList").scrollIntoView({ behavior: "smooth" });
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
