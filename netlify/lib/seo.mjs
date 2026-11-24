// Search-engine pages for listings: /homes/<ListingKey>-<address-slug>
//
// The app itself navigates with #/home/<key> (one HTML page), which search engines treat as a
// single page. These server-rendered pages give every listing its own indexable address with a
// real title, description, canonical link, structured data and a readable summary, then hand
// off to the normal app in the browser.
//
// IDX compliance on these pages: listing brokerage ("courtesy of"), BeachesMLS mark and the
// required disclaimer are included; listings with the address withheld are noindex and left out
// of the sitemap; listings not displayable on the internet never reach the index at all.

import { readIndex as getIndex, indexTag } from "./store.mjs";
import { allReviews, statusOf, reviewHomeKey, offList, isOff } from "./reviews.mjs";
import { getSettings } from "./moderation.mjs";
import { homeKey, homeSlug } from "../../js/homekey.js";
import { INDEX_FIELDS, INDEX_FLAGS } from "./index-format.mjs";

export const siteUrl = () => (process.env.URL || "https://toured.netlify.app").replace(/\/+$/, "");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);

/** Rebuilds a listing from its compact index row. */
export function rowToListing(key, row) {
  const l = { ListingKey: key, demo: {} };
  INDEX_FIELDS.forEach((f, i) => {
    const [a, b] = f.split(".");
    if (b) l.demo[b] = row[i]; else l[a] = row[i];
  });
  const flags = row[INDEX_FIELDS.length] || 0;
  INDEX_FLAGS.forEach((f, bit) => {
    const [a, b] = f.split(".");
    const v = Boolean(flags & (1 << bit));
    if (b) l.demo[b] = v; else l[a] = v;
  });
  l.Address = l.AddressHidden ? `${l.City}, FL ${l.PostalCode}` : `${l.StreetAddress}, ${l.City}, FL ${l.PostalCode}`;
  return l;
}

/** Published reviews grouped by listing key (excluding homes with reviews turned off). */
export async function publishedReviewsByListing() {
  return (await publishedReviews()).byListing;
}
/** Published reviews by listing key and by home (address) key. */
export async function publishedReviews() {
  const [rows, settings] = await Promise.all([allReviews(), getSettings()]);
  const off = offList(settings);
  const byListing = new Map(), byHome = new Map();
  const push = (m, k, r) => (m.get(k) || m.set(k, []).get(k)).push(r);
  for (const r of rows) {
    if (statusOf(r) !== "published") continue;
    const hk = reviewHomeKey(r);
    if (isOff(off, { listingId: r.listingId, hk })) continue;
    push(byListing, r.listingId, r);
    if (hk) push(byHome, hk, r);
  }
  for (const list of [...byListing.values(), ...byHome.values()]) list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { byListing, byHome };
}
/** Every review of a listing's home (earlier listings and "Look up a home" included). */
export function reviewsForListing(l, { byListing, byHome }) {
  const hk = l.AddressHidden ? null : homeKey(l.Address, l.PostalCode);
  return (hk && byHome.get(hk)) || byListing.get(l.ListingKey) || [];
}
// Home key -> active listing, rebuilt when the index changes.
let activeMemo = null;
async function activeHomes() {
  const tag = await indexTag();
  if (activeMemo?.tag === tag) return activeMemo.map;
  const map = new Map();
  for (const [key, row] of Object.entries(await getIndex())) {
    const l = rowToListing(key, row);
    if (l.AddressHidden) continue;
    const hk = homeKey(l.Address, l.PostalCode);
    if (hk) map.set(hk, l);
  }
  activeMemo = { tag, map };
  return map;
}
const avgRating = (rows) => rows.reduce((a, r) => a + (r.ratings?.overall || 0), 0) / rows.length;
const TOUR_TYPE = { open_house: "open house", private_showing: "private showing", builder_tour: "builder tour" };

// Homes "for sale" under $10,000 are almost always rentals entered as sales (the app hides them too).
const mispriced = (l) => l.ListPrice < 10000 && l.PropertyType !== "Land";

export const listingPath = (l) => `/homes/${l.ListingKey}-${slugify(l.AddressHidden ? `${l.City} fl ${l.PostalCode}` : `${l.StreetAddress} ${l.City} fl ${l.PostalCode}`)}`;

export async function findListing(key) {
  const row = (await getIndex())[key];
  return row ? rowToListing(key, row) : null;
}

const TYPE_SCHEMA = { Condo: "Apartment", Townhouse: "SingleFamilyResidence", "Single Family": "SingleFamilyResidence", "Multi-Family": "House", "Mobile/Manufactured": "House", Land: "Place" };

function describe(l) {
  const parts = [];
  if (l.BedroomsTotal) parts.push(`${l.BedroomsTotal} bed`);
  if (l.BathroomsTotalInteger) parts.push(`${l.BathroomsTotalInteger} bath`);
  if (l.LivingArea) parts.push(`${Number(l.LivingArea).toLocaleString("en-US")} sq ft`);
  else if (l.demo?.LotSizeSquareFeet) parts.push(`${+(l.demo.LotSizeSquareFeet / 43560).toFixed(2)} acre`);
  const kind = (l.PropertyType || "home").toLowerCase();
  return `${parts.join(", ")} ${kind} for sale in ${l.City}, FL ${l.PostalCode}${l.Neighborhood && l.Neighborhood !== l.City ? ` (${l.Neighborhood})` : ""}, listed at ${money(l.ListPrice)}.`;
}

/** Full HTML for a listing page: the app's index.html with SEO head tags and a readable summary. */
export function renderListingPage(appHtml, l, { canonical, reviews = [] }) {
  const lotAcres = l.demo.LotSizeSquareFeet ? +(l.demo.LotSizeSquareFeet / 43560).toFixed(2) : 0;
  const title = l.PropertyType === "Land" || !l.BedroomsTotal
    ? `${l.Address} | ${money(l.ListPrice)} | ${lotAcres ? `${lotAcres} acre ` : ""}land | iToured`
    : `${l.Address} | ${money(l.ListPrice)} | ${l.BedroomsTotal || 0} bd ${l.BathroomsTotalInteger || 0} ba | iToured`;
  const n = reviews.length;
  const desc = n
    ? `${describe(l)} ${n} tour review${n > 1 ? "s" : ""} from buyers who walked through it, rated ${avgRating(reviews).toFixed(1)} out of 5.`
    : `${describe(l)} See photos, taxes, sale history and tour reviews from buyers who toured it.`;
  const img = l.primaryPhotoUrl || `${siteUrl()}/assets/brand/toured-icon-512.png`;
  const year = new Date().getFullYear();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.Address,
    url: canonical,
    image: l.primaryPhotoUrl || undefined,
    description: describe(l),
    offers: { "@type": "Offer", price: l.ListPrice, priceCurrency: "USD", availability: "https://schema.org/InStock" },
    about: {
      "@type": TYPE_SCHEMA[l.PropertyType] || "SingleFamilyResidence",
      address: { "@type": "PostalAddress", streetAddress: l.AddressHidden ? undefined : l.StreetAddress, addressLocality: l.City, addressRegion: "FL", postalCode: l.PostalCode, addressCountry: "US" },
      numberOfRooms: l.BedroomsTotal || undefined,
      floorSize: l.LivingArea ? { "@type": "QuantitativeValue", value: l.LivingArea, unitCode: "FTK" } : undefined,
      geo: { "@type": "GeoCoordinates", latitude: l.Latitude, longitude: l.Longitude },
      aggregateRating: n ? { "@type": "AggregateRating", ratingValue: Number(avgRating(reviews).toFixed(1)), reviewCount: n, bestRating: 5, worstRating: 1 } : undefined,
      review: n ? reviews.slice(0, 20).map((r) => ({
        "@type": "Review", name: r.title, reviewBody: r.body, datePublished: String(r.createdAt).slice(0, 10),
        author: { "@type": "Person", name: r.displayName },
        reviewRating: { "@type": "Rating", ratingValue: r.ratings?.overall, bestRating: 5, worstRating: 1 },
      })) : undefined,
    },
  };
  const reviewsHtml = n ? `<section class="seo-reviews">
      <h2>Tour reviews (${n}) · ${avgRating(reviews).toFixed(1)} out of 5</h2>
      <p>Written by people who certify they toured ${esc(l.Address)} in person.</p>
      ${reviews.slice(0, 20).map((r) => `<article>
        <h3>${esc(r.title)}</h3>
        <p><b>${r.ratings?.overall || ""} out of 5</b> · ${esc(r.displayName)} · toured ${esc(r.tour?.date || "")}${TOUR_TYPE[r.tour?.type] ? ` (${TOUR_TYPE[r.tour.type]})` : ""}</p>
        <p>${esc(r.body)}</p>
        ${r.pros ? `<p><b>Liked:</b> ${esc(r.pros)}</p>` : ""}${r.cons ? `<p><b>Watch out for:</b> ${esc(r.cons)}</p>` : ""}
      </article>`).join("")}
      <p><small>Tour reviews are opinions of iToured users, not information from BeachesMLS or the listing broker.</small></p>
    </section>` : `<p>No tour reviews yet. If you toured this home, you can be the first to review it on iToured.</p>`;
  const cityLink = l.City ? `<a href="/fl/${slugify(l.City)}">More homes in ${esc(l.City)}</a> · ` : "";
  const head = `<base href="/">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${esc(canonical)}">
  ${l.AddressHidden ? '<meta name="robots" content="noindex">' : ""}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(img)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  <script>window.__SEO_LISTING__ = ${JSON.stringify(l.ListingKey)};</script>`;
  const facts = [
    l.BedroomsTotal && `${l.BedroomsTotal} bedrooms`, l.BathroomsTotalInteger && `${l.BathroomsTotalInteger} bathrooms`,
    l.LivingArea && `${Number(l.LivingArea).toLocaleString("en-US")} sq ft`, l.demo.YearBuilt && `built ${l.demo.YearBuilt}`,
    l.PropertyType, l.demo.AssociationFee ? `HOA ${money(l.demo.AssociationFee)}/mo` : null,
  ].filter(Boolean);
  const body = `<article class="seo-listing" id="seoListing">
    <h1>${esc(l.Address)}</h1>
    <p class="seo-price">${money(l.ListPrice)}</p>
    ${l.primaryPhotoUrl ? `<img src="${esc(l.primaryPhotoUrl)}" alt="${esc(l.Address)}" width="640" loading="eager">` : ""}
    <p>${esc(describe(l))}</p>
    <ul>${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    <p>MLS # ${esc(l.MlsNumber || "")} · Listing courtesy of ${esc(l.ListOfficeName || "the listing brokerage")}${l.ListOfficePhone ? ` · ${esc(l.ListOfficePhone)}` : ""}</p>
    <p><small>All listings featuring the BMLS logo are provided by BeachesMLS, Inc. This information is not verified for authenticity or accuracy and is not guaranteed. Copyright ©${year} BeachesMLS, Inc.</small></p>
    ${reviewsHtml}
    <p><a href="/#/home/${esc(l.ListingKey)}">View photos, taxes, sale history and tour reviews</a> · ${cityLink}<a href="/">Search homes</a> · <a href="/about">About iToured</a></p>
  </article>`;
  return stripHomeSeo(appHtml)
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta name="description"[^>]*>/i, "")
    .replace(/<head>/i, `<head>\n  ${head}`)
    .replace(/<body>/i, `<body>\n  ${body}`);
}

// index.html carries homepage-only tags between <!-- seo:home --> markers; other pages drop them.
const stripHomeSeo = (html) => html.replace(/<!-- seo:home -->[\s\S]*?<!-- \/seo:home -->/g, "");

export function renderGonePage(appHtml) {
  return stripHomeSeo(appHtml).replace(/<head>/i, `<head>\n  <base href="/">\n  <meta name="robots" content="noindex">`)
    .replace(/<body>/i, `<body>\n  <article class="seo-listing" id="seoListing"><h1>This home is no longer for sale</h1><p><a href="/">Search homes for sale</a></p></article>`);
}

const PER_FILE = 40000; // sitemap files are limited to 50,000 URLs

async function listingUrls() {
  const base = siteUrl();
  const out = [];
  for (const [key, row] of Object.entries(await getIndex())) {
    const l = rowToListing(key, row);
    if (l.AddressHidden || mispriced(l)) continue;
    const lastmod = l.ModificationTimestamp ? `<lastmod>${String(l.ModificationTimestamp).slice(0, 10)}</lastmod>` : "";
    out.push(`<url><loc>${base}${esc(listingPath(l))}</loc>${lastmod}</url>`);
  }
  return out;
}
const urlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

/** /sitemap.xml: an index of /sitemaps/<n>.xml files (main pages + every displayable listing). */
export async function renderSitemap() {
  const base = siteUrl();
  const n = Math.max(1, Math.ceil((await listingUrls()).length / PER_FILE));
  const items = Array.from({ length: n }, (_, i) => `<sitemap><loc>${base}/sitemaps/${i + 1}.xml</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}

/** /sitemaps/<n>.xml (1-based). File 1 also lists the home and legal pages. */
export async function renderSitemapPart(n) {
  const base = siteUrl();
  const all = await listingUrls();
  const part = all.slice((n - 1) * PER_FILE, n * PER_FILE);
  if (n > 1 && !part.length) return null;
  const head = n === 1 ? [`<url><loc>${base}/</loc><changefreq>daily</changefreq></url>`,
    ...["/about", "/how-it-works", "/faq"].map((u) => `<url><loc>${base}${u}</loc><changefreq>monthly</changefreq></url>`),
    `<url><loc>${base}/fl</loc><changefreq>daily</changefreq></url>`,
    ...(await cityList()).map((c) => `<url><loc>${base}/fl/${c.slug}</loc><changefreq>daily</changefreq></url>`),
    ...(await reviewPageUrls()).map((u) => `<url><loc>${base}${u}</loc><changefreq>weekly</changefreq></url>`),
    `<url><loc>${base}/privacy.html</loc><changefreq>monthly</changefreq></url>`,
    `<url><loc>${base}/terms.html</loc><changefreq>monthly</changefreq></url>`] : [];
  return urlset([...head, ...part]);
}

/* ---------------- City pages: /fl and /fl/<city> ---------------- */
const MIN_CITY_LISTINGS = 15;
const CITY_PAGE_LISTINGS = 120;
// Shown first on /fl and linked from the homepage.
export const FEATURED_CITIES = ["Miami", "Fort Lauderdale", "Boca Raton", "West Palm Beach", "Hollywood", "Miami Beach", "Coral Springs",
  "Pembroke Pines", "Delray Beach", "Boynton Beach", "Pompano Beach", "Jupiter", "Port St. Lucie", "Hialeah", "Homestead"];

let cityMemo = null;
async function cityGroups() {
  const tag = await indexTag();
  if (cityMemo?.tag === tag) return cityMemo.groups;
  const groups = new Map();
  for (const [key, row] of Object.entries(await getIndex())) {
    const l = rowToListing(key, row);
    if (!l.City || l.AddressHidden || !l.ListPrice || mispriced(l)) continue;
    const slug = slugify(l.City);
    if (!slug) continue;
    let g = groups.get(slug);
    if (!g) groups.set(slug, g = { slug, name: l.City, counties: {}, listings: [] });
    g.listings.push(l);
    if (l.County) g.counties[l.County] = (g.counties[l.County] || 0) + 1;
  }
  for (const g of groups.values()) g.county = Object.entries(g.counties).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  cityMemo = { tag, groups };
  return groups;
}
export async function cityList() {
  return [...(await cityGroups()).values()].filter((g) => g.listings.length >= MIN_CITY_LISTINGS)
    .map(({ slug, name, county, listings }) => ({ slug, name, county, count: listings.length }))
    .sort((a, b) => b.count - a.count);
}

const ORG_LD = { "@type": "Organization", "@id": "https://itoured.com/#organization", name: "iToured", url: "https://itoured.com/" };
function contentPage({ path, title, desc, h1, body, ld, mls = true, noindex = false }) {
  const base = siteUrl();
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${base}${path}">
  ${noindex ? '<meta name="robots" content="noindex">' : ""}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="iToured">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${base}${path}">
  <meta property="og:image" content="${base}/assets/brand/preview.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#ffffff">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Fraunces:opsz,wght@9..144,700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/legal.css">
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [ORG_LD, ...ld] }).replace(/</g, "\\u003c")}</script>
</head>
<body>
  <header class="legal-head"><a href="/"><img src="/assets/brand/toured-icon.svg" width="28" height="28" alt="">iToured</a><span class="legal-firm">LoKation Real Estate</span>
    <nav class="legal-nav" aria-label="Site"><a href="/">Search homes</a><a href="/about">About</a><a href="/how-it-works">How it works</a><a href="/faq">FAQ</a><a href="/fl">Cities</a></nav></header>
  <main class="wide">
    <h1>${esc(h1)}</h1>
${body}
    ${mls ? `<p class="idx-note"><img src="/assets/beachesmls-logo.jpg" alt="BeachesMLS" height="22"> All listings featuring the BMLS logo are provided by BeachesMLS, Inc. This information is not verified for authenticity or accuracy and is not guaranteed. Copyright ©${year} BeachesMLS, Inc. Displayed by Rajesh Jaiprashad, LoKation Real Estate.</p>` : ""}
    <footer>iToured (itoured.com) is operated by Rajesh Jaiprashad, Florida real estate sales associate, license SL3403530, LoKation Real Estate. · <a href="/">Search homes</a> · <a href="/about">About</a> · <a href="/how-it-works">How it works</a> · <a href="/faq">FAQ</a> · <a href="/fl">Cities</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></footer>
  </main>
</body>
</html>
`;
}

/** /fl — every city with homes for sale. */
export async function renderCityIndex() {
  const cities = await cityList();
  const total = cities.reduce((a, c) => a + c.count, 0);
  const bySlug = new Map(cities.map((c) => [c.slug, c]));
  const featured = FEATURED_CITIES.map((n) => bySlug.get(slugify(n))).filter(Boolean);
  const byCounty = new Map();
  for (const c of cities) (byCounty.get(c.county || "Other") || byCounty.set(c.county || "Other", []).get(c.county || "Other")).push(c);
  const order = ["Miami-Dade", "Broward", "Palm Beach"];
  const counties = [...byCounty.keys()].sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99) || byCounty.get(b).length - byCounty.get(a).length);
  const li = (c) => `<li><a href="/fl/${c.slug}">${esc(c.name)}</a> <span class="muted">${c.count.toLocaleString("en-US")} homes</span></li>`;
  const body = `    <p class="lede">iToured lists ${total.toLocaleString("en-US")} homes for sale across South Florida and shows reviews from buyers who toured them in person. Choose a city to see its homes and any tour reviews.</p>
    ${featured.length ? `<h2>Popular South Florida cities</h2><ul class="city-list">${featured.map(li).join("")}</ul>` : ""}
    ${counties.map((k) => `<h2>${esc(k)}${k === "Other" ? "" : " County"}</h2><ul class="city-list">${byCounty.get(k).sort((a, b) => a.name.localeCompare(b.name)).map(li).join("")}</ul>`).join("\n    ")}
    <p class="cta"><a class="cta-btn" href="/">Search all homes</a></p>`;
  return contentPage({ path: "/fl", title: "South Florida homes for sale by city, with tour reviews | iToured",
    desc: `Browse ${total.toLocaleString("en-US")} South Florida homes for sale by city on iToured (itoured.com), with reviews from buyers who toured them in person.`,
    h1: "South Florida homes for sale by city", body,
    ld: [{ "@type": "CollectionPage", name: "South Florida homes for sale by city", url: siteUrl() + "/fl" }] });
}

/** /fl/<city> — homes for sale in one city, reviewed homes first. Returns null for unknown cities. */
export async function renderCityPage(slug) {
  const g = (await cityGroups()).get(slug);
  if (!g || g.listings.length < MIN_CITY_LISTINGS) return null;
  const pr = await publishedReviews();
  const rv = (l) => reviewsForListing(l, pr);
  const ls = g.listings;
  const prices = ls.map((l) => l.ListPrice).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const reviewed = ls.filter((l) => rv(l).length);
  const newest = ls.filter((l) => !rv(l).length)
    .sort((a, b) => String(b.ModificationTimestamp || "").localeCompare(String(a.ModificationTimestamp || ""))).slice(0, CITY_PAGE_LISTINGS);
  const types = {};
  for (const l of ls) types[l.PropertyType || "Home"] = (types[l.PropertyType || "Home"] || 0) + 1;
  const typeText = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${c.toLocaleString("en-US")} ${t.toLowerCase()}`).join(", ");
  const where = `${g.name}, FL`;
  const row = (l) => {
    const rvs = rv(l).length ? rv(l) : null;
    return `<li><a href="${esc(listingPath(l))}">${esc(l.StreetAddress)}</a> · <b>${money(l.ListPrice)}</b> · ${l.BedroomsTotal || 0} bd, ${l.BathroomsTotalInteger || 0} ba${l.LivingArea ? `, ${Number(l.LivingArea).toLocaleString("en-US")} sq ft` : ""}${l.PropertyType ? ` · ${esc(l.PropertyType)}` : ""}${rvs ? ` · <b>★ ${avgRating(rvs).toFixed(1)}</b> (${rvs.length} tour review${rvs.length > 1 ? "s" : ""})` : ""}<br><small class="muted">Listing courtesy of ${esc(l.ListOfficeName || "the listing brokerage")}</small></li>`;
  };
  const body = `    <p class="lede">There are ${ls.length.toLocaleString("en-US")} homes for sale in ${esc(where)}${g.county ? ` (${esc(g.county)} County)` : ""} on iToured, priced from ${money(prices[0])} to ${money(prices[prices.length - 1])} with a median asking price of ${money(median)}${typeText ? `: ${esc(typeText)}` : ""}.</p>
    <p>iToured (itoured.com) shows what listing photos can't: reviews from buyers who walked through the home in person. ${reviewed.length ? `${reviewed.length} ${esc(g.name)} home${reviewed.length > 1 ? "s have" : " has"} tour reviews so far.` : `No ${esc(g.name)} homes have tour reviews yet. If you've toured one, <a href="/how-it-works">post the first review</a>.`}</p>
    ${reviewed.length ? `<h2>${esc(g.name)} homes with tour reviews</h2><ul class="home-list">${reviewed.map(row).join("")}</ul>` : ""}
    <h2>${reviewed.length ? "More" : "Newest"} homes for sale in ${esc(g.name)}</h2>
    <ul class="home-list">${newest.map(row).join("")}</ul>
    ${ls.length > reviewed.length + newest.length ? `<p class="muted">Showing ${(reviewed.length + newest.length).toLocaleString("en-US")} of ${ls.length.toLocaleString("en-US")} homes.</p>` : ""}
    <p class="cta"><a class="cta-btn" href="/?q=${encodeURIComponent(g.name)}">Search all ${esc(g.name)} homes on the map</a></p>
    <p><a href="/fl">Other South Florida cities</a> · <a href="/about">About iToured</a> · <a href="/faq">FAQ</a></p>`;
  return contentPage({ path: `/fl/${slug}`, title: `${g.name}, FL homes for sale with tour reviews | iToured`,
    desc: `${ls.length.toLocaleString("en-US")} homes for sale in ${where}, median asking price ${money(median)}. Read reviews from buyers who toured them in person on iToured.`,
    h1: `${where} homes for sale and tour reviews`, body,
    ld: [{ "@type": "CollectionPage", name: `Homes for sale in ${where}`, url: `${siteUrl()}/fl/${slug}`,
      about: { "@type": "City", name: g.name, containedInPlace: { "@type": "State", name: "Florida" } } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "iToured", item: siteUrl() + "/" },
        { "@type": "ListItem", position: 2, name: "Cities", item: siteUrl() + "/fl" },
        { "@type": "ListItem", position: 3, name: g.name, item: `${siteUrl()}/fl/${slug}` }] }] });
}

/* ---------------- Permanent review pages: /reviews/<home> ----------------
 * Tour reviews belong to the house, not the listing. When a reviewed home isn't for sale on iToured
 * (sold, pending, withdrawn, or reviewed from "Look up a home"), its reviews live on here. No MLS
 * data appears on these pages (IDX covers active listings only): just the address, the reviews and
 * a link to the home's public county records.
 */
async function reviewPageUrls() {
  const [{ byHome }, active] = await Promise.all([publishedReviews(), activeHomes()]);
  return [...byHome.keys()].filter((hk) => !active.has(hk)).map((hk) => `/reviews/${homeSlug(hk)}`);
}

/** Where an old listing link should go: its home's review page, if the home has reviews. */
export async function reviewPageForListing(listingKey) {
  const { byListing } = await publishedReviews();
  const r = byListing.get(listingKey)?.[0];
  const hk = r && reviewHomeKey(r);
  return hk ? `/reviews/${homeSlug(hk)}` : null;
}

/** { redirect } when the home is listed again, { html } for its review page, or null. */
export async function renderHomeReviewsPage(slug) {
  const pr = await publishedReviews();
  const hk = [...pr.byHome.keys()].find((k) => homeSlug(k) === slug);
  if (!hk) return null;
  const listed = (await activeHomes()).get(hk);
  if (listed) return { redirect: listingPath(listed) };
  const reviews = pr.byHome.get(hk);
  const address = String(reviews.find((r) => r.address)?.address || hk).replace(/\s+/g, " ").trim();
  const n = reviews.length, avg = avgRating(reviews);
  const last = reviews.map((r) => r.tour?.date).filter(Boolean).sort().pop();
  const body = `    <p class="lede">${n} tour review${n > 1 ? "s" : ""} of ${esc(address)}, rated ${avg.toFixed(1)} out of 5 by people who toured it in person.</p>
    <p class="muted">This home isn't listed for sale on iToured right now. These reviews were written by buyers who toured it${last ? `, most recently in ${esc(new Date(last + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }))}` : ""}. A home's condition can change after a tour, so check each review's date.</p>
    <section class="seo-reviews">
      ${reviews.slice(0, 50).map((r) => `<article>
        <h2>${esc(r.title)}</h2>
        <p><b>${r.ratings?.overall || ""} out of 5</b> · ${esc(r.displayName)} · toured ${esc(r.tour?.date || "")}${TOUR_TYPE[r.tour?.type] ? ` (${TOUR_TYPE[r.tour.type]})` : ""}</p>
        <p>${esc(r.body)}</p>
        ${r.pros ? `<p><b>Liked:</b> ${esc(r.pros)}</p>` : ""}${r.cons ? `<p><b>Watch out for:</b> ${esc(r.cons)}</p>` : ""}
      </article>`).join("")}
    </section>
    <p><small>Tour reviews are opinions of iToured users who certified they toured the home in person. If you own this home and would like its reviews hidden, <a href="/#/contact">contact us</a>.</small></p>
    <p class="cta"><a class="cta-btn" href="/#/lookup">Look up this home's public records</a></p>
    <p><a href="/">Search homes for sale</a> · <a href="/fl">Homes by city</a> · <a href="/faq">FAQ</a></p>`;
  const html = contentPage({
    path: `/reviews/${slug}`, mls: false,
    title: `${address} tour reviews | iToured`,
    desc: `${n} review${n > 1 ? "s" : ""} of ${address} from people who toured it in person, rated ${avg.toFixed(1)} out of 5. Read what buyers noticed on iToured.`,
    h1: `Tour reviews: ${address}`, body,
    ld: [{ "@type": "Residence", name: address, url: `${siteUrl()}/reviews/${slug}`,
      aggregateRating: { "@type": "AggregateRating", ratingValue: Number(avg.toFixed(1)), reviewCount: n, bestRating: 5, worstRating: 1 },
      review: reviews.slice(0, 20).map((r) => ({ "@type": "Review", name: r.title, reviewBody: r.body, datePublished: String(r.createdAt).slice(0, 10),
        author: { "@type": "Person", name: r.displayName }, reviewRating: { "@type": "Rating", ratingValue: r.ratings?.overall, bestRating: 5, worstRating: 1 } })) }],
  });
  return { html };
}
