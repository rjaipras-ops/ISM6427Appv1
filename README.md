# Toured

A Zillow-style home search with Realtor.com-style filters for **Broward, Palm Beach and St. Lucie counties** (BeachesMLS territory). The difference: signed-in users who **certify they toured a home in person** can post reviews of it, so buyers learn what the listing photos leave out.

Static site with no build step. Netlify serves the repo root (`netlify.toml`).

## What's here

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app: map + list search, filters, listing detail, tour reviews, saved homes, mortgage estimate |
| `js/filters.js` | Filter model, matching, sorting, URL sync (searches are shareable links) |
| `js/store.js` | **Data layer.** Sign-in, reviews, saved homes, listing loading. Swap this file for a real backend |
| `js/config.js` | **Your agent details**, BeachesMLS disclaimer text and default map view |
| `js/art.js` | Generated house illustrations used in place of listing photos |
| `data/raw/` | Raw listing pull (Firecrawl, Nov 8 2026), one `.jsonl` file per county plus `manifest.json` |
| `data/listings.json` | App data built from the raw pull |
| `scripts/build-listings.mjs` | Rebuilds `data/listings.json` from `data/raw/` (`node scripts/build-listings.mjs`) |
| `scripts/fetch-parcels.mjs` | Looks up each listing's county parcel record (owner, values, sales, year built) from the Florida DOR statewide parcel layer and saves `data/parcels/parcels.json` |
| `vendor/leaflet/` | Leaflet 1.9.4 map library, bundled so the map doesn't depend on a CDN |
| `db/schema.sql` | Postgres/Supabase schema: users, listings, tours (certifications), reviews, saved homes and searches |

## Filters

County (Broward / Palm Beach / St. Lucie), location (address, neighborhood, city, ZIP), price, beds, baths, home type, listing status (active / contingent / pending), home size, lot size, year built, max HOA, days listed, stories, garage spaces, open house, price reduced, new construction, foreclosure, virtual tour, hide 55+, pool, waterfront, ocean access, boat dock, impact windows, golf community, outside flood zone, view, fireplace, gated, solar, EV charging, keyword. Toured-only filters: **has tour reviews** and **minimum tour rating**. Also "search as I move the map" and nine sort orders.

## Public records and taxes

Each listing page has a **Public records & taxes** section built from the Florida Department of Revenue statewide parcel layer (no API key):

```
https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0
```

- **Shown:** owner of record, parcel ID, land use, market (just) value, assessed and taxable value, land value, homestead exemption, actual/effective year built, county living area, lot size, last two sales (price, month, year, arm's-length or not).
- **Not stored or shown:** the owner's mailing address.
- **Taxes:** an estimated bill for the current owner (from taxable value) and for a buyer (the assessment resets near the purchase price). Both use approximate county millage. The **Tax bills & payment status** button opens the tax collector's record. For Broward and St. Lucie it goes straight to the parcel's bill history (paid, unpaid, tax certificates). For Palm Beach it opens the tax collector's site, and the page shows the parcel ID to search.
- Real year built and lot size replace the generated placeholders, so those filters use county data.

Refresh with:

```bash
node scripts/build-listings.mjs && node scripts/fetch-parcels.mjs && node scripts/build-listings.mjs
```

The layer only indexes parcel ID, owner and county, so lookups go by each listing's coordinates (address searches time out).

## Map

Leaflet is bundled in `vendor/leaflet/`. Tiles come from Esri's World Street Map (free, attribution required, no key), with OpenStreetMap as an automatic fallback. CARTO tiles were removed because they now require an API key.

## Data: what's real and what's placeholder

- **Real** (public listing data pulled via Firecrawl): price, address, beds, baths, sq ft, home type, coordinates, listing office, source link. 353 listings: 117 Broward, 121 Palm Beach, 115 St. Lucie.
- **Placeholder** (everything under `demo` in `listings.json`, marked **est.** in the UI): status, year built, lot, HOA, days listed, flood zone, features, open houses, description. They're generated so every filter works. Replace them with your MLS feed.
- **Photos** aren't included. Listing photos are copyrighted and licensed only through an MLS/IDX agreement. The app shows illustrations until `Media` comes from a feed.
- **Sample reviews**: six reviews are seeded and carry a "Sample" flag. Remove `SAMPLE_REVIEWS` in `js/store.js` before launch.

### Connecting a real MLS feed

You can't scrape the MLS directly. Access comes through an IDX license from BeachesMLS. As a member you request an IDX feed through BeachesMLS (ask them which data vendor and RESO Web API endpoint they issue credentials for). Listing fields already use RESO Data Dictionary names. So the plan is to fetch the feed in a Netlify Function, map it to the same shape, and point `loadListings()` in `js/store.js` at that function. IDX rules also require broker attribution and an MLS disclaimer on every listing. Put your details and the exact disclaimer text in `js/config.js`. The "Request a tour" button emails the address set there.

## Login and reviews (your next step)

Sign-in is a demo that stores data in browser `localStorage`. To make it real, re-implement the exported functions in `js/store.js` (`signIn`, `signOut`, `getUser`, `onAuthChange`, `addReview`, `getReviews`, etc.) on Supabase, Firebase or Netlify Identity, using `db/schema.sql`. The schema ties each review to a `tour` row (one per user per listing). Its `method` column lets you upgrade verification later: from self-certified to agent-confirmed, showing-service match, or on-site geo check-in. Run the same validation rules as `validateReview()` on the server.

## Run locally

```bash
npx serve .
```

(Opening `index.html` directly won't work: the listing data is loaded with `fetch`.)

## Deploy

In Netlify, choose "Import from Git", pick this repo and branch `main`. Leave the build command empty and set the publish directory to `.`.
