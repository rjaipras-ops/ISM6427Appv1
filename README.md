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
| `netlify/functions/`, `netlify/lib/` | BeachesMLS IDX feed: API endpoints, sync engine, storage (see below) |
| `js/gallery.js` | Listing photo carousel and full-screen photo viewer |
| `scripts/dev-server.mjs`, `scripts/idx-sync.mjs` | Local dev server (`npm run dev`) and one-shot full sync (`npm run idx:sync`) |
| `vendor/leaflet.markercluster/` | Groups map pins into clusters so tens of thousands of listings stay fast |
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

## Property pictures

Until the IDX feed supplies listing photos, every home shows **real aerial imagery** with the **county parcel boundary** outlined in yellow:

- **Search cards:** a static satellite image from Esri's World Imagery export service, with the outline drawn on top. Condo units without their own outline get a pin instead.
- **Listing page:** an interactive satellite close-up with the outline, a wider neighborhood view and a street map. The **View photos ↗** button opens the listing's photos in Zillow's photo viewer (a plain link; nothing is copied or embedded).
- Outlines come from the Florida DOR parcel layer. `scripts/fetch-parcel-shapes.mjs` saves them to `data/parcels/shapes.json`, and the build keeps an outline only if the listing's location falls inside it (306 of 307 do).

**Esri imagery terms.** The imagery and street-map tiles are Esri ArcGIS Online basemaps. They require the attribution shown on the maps and images ("Imagery © Esri, Maxar, Earthstar Geographics…"). Non-commercial use needs no account. **Commercial use, which a brokerage site is, requires an ArcGIS account.** Esri's ArcGIS Location Platform has a free tier. Sign up, create an API key, and follow Esri's instructions to switch the basemap URLs in `js/imagery.js` and `js/app.js` (`addBasemap`) to authenticated ones. Check that your expected traffic fits the free tier, and review Esri's current terms.

Street View isn't included: Google Street View requires a Google Maps API key with billing enabled.

Refresh outlines with:

```bash
node scripts/fetch-parcel-shapes.mjs && node scripts/build-listings.mjs
```

## Map

Leaflet is bundled in `vendor/leaflet/`. Tiles come from Esri's World Street Map (attribution required; see the Esri terms note above for commercial use), with OpenStreetMap as an automatic fallback. CARTO tiles were removed because they now require an API key.

## Data: what's real and what's placeholder

- **Real** (public listing data pulled via Firecrawl): price, address, beds, baths, sq ft, home type, coordinates, listing office, source link. 353 listings: 117 Broward, 121 Palm Beach, 115 St. Lucie.
- **Placeholder** (everything under `demo` in `listings.json`, marked **est.** in the UI): status, year built, lot, HOA, days listed, flood zone, features, open houses, description. They're generated so every filter works. Replace them with your MLS feed.
- **Photos** aren't included. Listing photos are copyrighted and licensed only through an MLS/IDX agreement. The app shows illustrations until `Media` comes from a feed.
- **Sample reviews**: six reviews are seeded and carry a "Sample" flag. Remove `SAMPLE_REVIEWS` in `js/store.js` before launch.

### The BeachesMLS IDX feed

Live listings and photos come from your **BeachesMLS IDX feed** (Flexmls Spark Datamart WebAPI), through Netlify Functions. Until a token is set, the site runs in **test mode** (see below).

**How it works**

| Piece | File | What it does |
|---|---|---|
| Spark client | `netlify/lib/spark.mjs` | Sends `Authorization: Bearer …` and `X-SparkApi-User-Agent`; pages through results; retries on rate limits (429) and server errors. Supports the RESO Web API (`…/Reso/OData`, recommended) and the Spark REST API (`…/v1`). |
| Normalizer | `netlify/lib/normalize.mjs` | Converts feed records into the app's listing shape. Photos become a `photos` array sorted by `Order` (`url` large, `medium`, `thumb`, `caption`), plus `primaryPhotoUrl`. Listings whose seller opted out of internet display are skipped; withheld addresses are hidden. |
| Sync engine | `netlify/lib/sync.mjs` | **Initial** sync of every active listing, then **delta** syncs (`ModificationTimestamp` or `PhotosChangeTimestamp` newer than the last sync, with a 5-minute overlap). Anything no longer `Active` is removed immediately. A **daily reconcile** removes listings that vanished from the feed without an update (deleted, withdrawn, opted out). Each run stops after ~22 s and resumes on the next run. |
| Storage | `netlify/lib/store.mjs` | Netlify Blobs on Netlify (automatic, no setup); `.idx-cache/` files locally. |
| Schedule | `netlify/functions/idx-sync-scheduled.mjs` | Runs every 5 minutes; syncs when `IDX_SYNC_INTERVAL_MINUTES` (default 15) has passed, or continues an unfinished sync. |
| Public records | `netlify/lib/parcels.mjs` | County parcel data per listing, looked up when a listing is first opened and cached. Slow lookups are queued and finished by the next scheduled run. |

**API endpoints**

| Endpoint | Returns |
|---|---|
| `GET /api/idx/listings` | Every active listing in a compact, gzip-compressed format for the map, cards and filters (with an ETag, so unchanged data isn't re-downloaded). |
| `GET /api/idx/listing/:key` | One listing with all photos, remarks and office contact (cached for one sync interval). `410` if it's no longer active; it's also removed from the map right away. |
| `GET /api/idx/parcel/:key` | Public parcel records for a listing (`status: "pending"` while the county server is slow). |
| `GET /api/idx/sync-status` | `lastSyncTimestamp`, number of active listings, current sync phase, last run. |
| `POST /api/idx/sync` | Forces a sync run. Requires `Authorization: Bearer <IDX_SYNC_SECRET>`; disabled while `IDX_SYNC_SECRET` is empty. |

The browser checks `/api/idx/sync-status` every 5 minutes (`refreshMinutes` in `js/config.js`) and whenever the tab becomes visible. If there's a newer sync, it updates the pins, cards and counts **without moving the map** or closing an open listing, popup or photo viewer.

**Going live, once BeachesMLS approves your Datamart key**

1. In Netlify, open **Site configuration → Environment variables** and add the variables from `.env.example`. At minimum:
   - `SPARK_API_BEARER_TOKEN`: your Datamart access token.
   - `SPARK_API_BASE_URL` (optional): defaults to `https://replication.sparkapi.com/Version/3/Reso/OData`, the version 3 endpoint FBS recommends for BeachesMLS Datamart feeds. The first full load (~29,000 active homes across the three counties) takes about an hour of 5-minute scheduled runs; after that only changes are synced.
   - `IDX_SYNC_SECRET`: any long random string, if you want the manual sync endpoint.
2. Redeploy. The first full sync starts within 5 minutes and spans several runs (about 150–300 pages for all three counties). To do it in one go from your computer instead, put the same variables plus `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` in `.env` and run `npm run idx:sync`.
3. Check `https://<your-site>/api/idx/sync-status`. `"mode": "live"` and a growing `activeListings` mean it's working.
4. Confirm two settings against your data:
   - `IDX_COUNTIES`: the exact `CountyOrParish` spelling BeachesMLS uses (default `Broward,Palm Beach,St. Lucie`).
   - `IDX_PROPERTY_TYPES` (default `Residential`).

   If `activeListings` stays at 0 after the first sync, these are the first thing to check.

**Test mode** (no token): the API serves the demo homes as sample listings in the same RESO format, with Esri satellite and street-map images standing in for photos. The search page shows a "Sample data (test mode)" banner, and the server logs `[IDX] MOCK MODE`. Setting the token switches to live data automatically and rebuilds the index.

### BeachesMLS IDX compliance

From the *BeachesMLS IDX and VOW Rules and Regulations* (Section 20):

| Requirement | Where it's handled |
|---|---|
| Identify your brokerage clearly | `SITE.brokerage` (LoKation Real Estate) on every listing and in the footer |
| Listing firm + email or phone, in type no smaller than the listing details | "Listing courtesy of …" on every card (14px) and listing page (15px), and in the photo viewer |
| BeachesMLS logo on every IDX listing | `SITE.mlsLogo`. **Get the official logo file from BeachesMLS/RWorld** and set the path; a "BMLS" text mark shows until then. |
| Required disclaimer | `SITE.mlsDisclaimer()`: the official wording, with the year updated automatically. On listing pages, in the photo viewer and in the footer. |
| No seller/occupant names (20.3.8) | Owner names are never sent for MLS listings (`IDX_SHOW_OWNER=false`). The **Owner & full property record** button links to the county property appraiser instead. |
| Non-MLS data clearly separated | Public records, tax estimates, imagery and reviews are labeled "Not from BeachesMLS" |
| Don't modify MLS data | MLS listings never get the generated "est." placeholder fields |
| Seller can turn off reviews | Add the listing's key or MLS # to `SITE.reviewsDisabled` |
| Refresh at least every 12 hours | Syncs every 15 minutes by default; "Last updated" and "Feed refreshed" timestamps are shown |
| Off-market listings removed | Removed at the next sync; a listing opened after going off-market is removed immediately |

### MLS Search page

**MLS Search** in the menu embeds your free Flexmls IDX Lite search (`SITE.idxLiteUrl`), so visitors can browse every BeachesMLS listing with photos even before the Datamart key is active. Flexmls handles its compliance. The link must be `https`.

## Login and reviews (your next step)

Sign-in is a demo that stores data in browser `localStorage`. To make it real, re-implement the exported functions in `js/store.js` (`signIn`, `signOut`, `getUser`, `onAuthChange`, `addReview`, `getReviews`, etc.) on Supabase, Firebase or Netlify Identity, using `db/schema.sql`. The schema ties each review to a `tour` row (one per user per listing). Its `method` column lets you upgrade verification later: from self-certified to agent-confirmed, showing-service match, or on-site geo check-in. Run the same validation rules as `validateReview()` on the server.

## Run locally

```bash
npm install
cp .env.example .env    # leave SPARK_API_BEARER_TOKEN empty for test mode
npm run dev             # http://localhost:8888 — site + /api/idx/* functions
```

`netlify dev` (Netlify CLI) works too. A plain static server (`npx serve .`) also works, but without the API it falls back to the demo data in `data/listings.json`.

## Deploy

In Netlify, choose "Import from Git", pick this repo and branch `main`. Netlify reads `netlify.toml`: there's no build command, the publish directory is `.` and the functions are in `netlify/functions`. Add the environment variables above when your Spark key is ready. Netlify Blobs and the 5-minute schedule need no extra setup.
