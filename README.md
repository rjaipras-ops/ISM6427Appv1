# Toured

A Zillow-style home search with Realtor.com-style filters. The difference: signed-in users who **certify they toured a home in person** can post reviews of it, so buyers learn what the listing photos leave out.

Static site with no build step. Netlify serves the repo root (`netlify.toml`).

## What's here

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app: map + list search, filters, listing detail, tour reviews, saved homes, mortgage estimate |
| `js/filters.js` | Filter model, matching, sorting, URL sync (searches are shareable links) |
| `js/store.js` | **Data layer.** Sign-in, reviews, saved homes, listing loading. Swap this file for a real backend |
| `js/art.js` | Generated house illustrations used in place of listing photos |
| `data/raw/` | Raw listing pull (Firecrawl, Nov 8 2026, Tampa Bay) |
| `data/listings.json` | App data built from the raw pull |
| `scripts/build-listings.mjs` | Rebuilds `data/listings.json` from `data/raw/*.json` (`node scripts/build-listings.mjs`) |
| `db/schema.sql` | Postgres/Supabase schema: users, listings, tours (certifications), reviews, saved homes and searches |

## Filters

Location (address, neighborhood, city, ZIP), price, beds, baths, home type, listing status (active / contingent / pending), home size, lot size, year built, max HOA, days listed, stories, garage spaces, open house, price reduced, new construction, foreclosure, virtual tour, hide 55+, pool, waterfront, view, fireplace, central air, basement, gated, solar, EV charging, keyword. Toured-only filters: **has tour reviews** and **minimum tour rating**. Also "search as I move the map" and nine sort orders.

## Data: what's real and what's placeholder

- **Real** (public listing data pulled via Firecrawl): price, address, beds, baths, sq ft, home type, coordinates, listing office, source link. 121 Tampa Bay listings.
- **Placeholder** (everything under `demo` in `listings.json`, marked **est.** in the UI): status, year built, lot, HOA, days listed, features, open houses, description. They're generated so every filter works. Replace them with your MLS feed.
- **Photos** aren't included. Listing photos are copyrighted and licensed only through an MLS/IDX agreement. The app shows illustrations until `Media` comes from a feed.
- **Sample reviews**: six reviews are seeded and carry a "Sample" flag. Remove `SAMPLE_REVIEWS` in `js/store.js` before launch.

### Connecting a real MLS feed

You can't scrape the MLS directly. Access comes through an IDX/VOW license from your local MLS (Tampa: Stellar MLS) and is usually delivered over a RESO Web API (for example Bridge Interactive, Trestle or Spark). Listing fields already use RESO Data Dictionary names. So the plan is to fetch the feed in a Netlify Function, map it to the same shape, and point `loadListings()` in `js/store.js` at that function. IDX rules also require broker attribution and an MLS disclaimer on every listing.

## Login and reviews (your next step)

Sign-in is a demo that stores data in browser `localStorage`. To make it real, re-implement the exported functions in `js/store.js` (`signIn`, `signOut`, `getUser`, `onAuthChange`, `addReview`, `getReviews`, etc.) on Supabase, Firebase or Netlify Identity, using `db/schema.sql`. The schema ties each review to a `tour` row (one per user per listing). Its `method` column lets you upgrade verification later: from self-certified to agent-confirmed, showing-service match, or on-site geo check-in. Run the same validation rules as `validateReview()` on the server.

## Run locally

```bash
npx serve .
```

(Opening `index.html` directly won't work: the listing data is loaded with `fetch`.)

## Deploy

In Netlify, choose "Import from Git", pick this repo and branch `main`. Leave the build command empty and set the publish directory to `.`.
