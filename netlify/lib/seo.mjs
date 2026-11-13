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

import { getIndex } from "./store.mjs";
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
  const kind = (l.PropertyType || "home").toLowerCase();
  return `${parts.join(", ")} ${kind} for sale in ${l.City}, FL ${l.PostalCode}${l.Neighborhood && l.Neighborhood !== l.City ? ` (${l.Neighborhood})` : ""}, listed at ${money(l.ListPrice)}.`;
}

/** Full HTML for a listing page: the app's index.html with SEO head tags and a readable summary. */
export function renderListingPage(appHtml, l, { canonical }) {
  const title = `${l.Address} | ${money(l.ListPrice)} | ${l.BedroomsTotal || 0} bd ${l.BathroomsTotalInteger || 0} ba | Toured`;
  const desc = `${describe(l)} See photos, taxes, sale history and tour reviews from buyers who toured it.`;
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
    },
  };
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
    <p><a href="/#/home/${esc(l.ListingKey)}">View photos, taxes, sale history and tour reviews</a> · <a href="/">Search homes</a></p>
  </article>`;
  return appHtml
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta name="description"[^>]*>/i, "")
    .replace(/<head>/i, `<head>\n  ${head}`)
    .replace(/<body>/i, `<body>\n  ${body}`);
}

export function renderGonePage(appHtml) {
  return appHtml.replace(/<head>/i, `<head>\n  <base href="/">\n  <meta name="robots" content="noindex">`)
    .replace(/<body>/i, `<body>\n  <article class="seo-listing" id="seoListing"><h1>This home is no longer for sale</h1><p><a href="/">Search homes for sale</a></p></article>`);
}

/** sitemap.xml: home page, legal pages and every displayable listing. */
export async function renderSitemap() {
  const base = siteUrl();
  const idx = await getIndex();
  const urls = [`<url><loc>${base}/</loc><changefreq>daily</changefreq></url>`,
    `<url><loc>${base}/privacy.html</loc><changefreq>monthly</changefreq></url>`,
    `<url><loc>${base}/terms.html</loc><changefreq>monthly</changefreq></url>`];
  for (const [key, row] of Object.entries(idx)) {
    const l = rowToListing(key, row);
    if (l.AddressHidden) continue;
    const lastmod = l.ModificationTimestamp ? `<lastmod>${String(l.ModificationTimestamp).slice(0, 10)}</lastmod>` : "";
    urls.push(`<url><loc>${base}${esc(listingPath(l))}</loc>${lastmod}</url>`);
    if (urls.length >= 49000) break; // sitemap limit is 50,000 URLs
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
