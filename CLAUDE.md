# Working on itoured.com

## Saving and deploying (Netlify credits)

Every push to the production branch normally starts a Netlify deploy, and each deploy costs
15 credits. To keep that under the owner's control:

- **Save every change to GitHub right away**, on both `claude/admiring-hypatia-xexmgo`
  (production) and `main`, with `[skip netlify]` in the commit message. That stores the work
  without deploying.
- **Deploy only in batches the owner asks for.** A batch is about 10 site changes unless the
  owner says otherwise. When they say "push a batch" (or "publish"), push a normal commit
  without `[skip netlify]` (an empty commit is fine if nothing new is pending); every change
  saved since the last deploy goes live together.
- **Show the owner screenshots of site changes before they are published** (phone and desktop
  where layout is involved).
- Changes that only touch `scripts/records/` (the daily record check, run by GitHub Actions)
  never need a Netlify deploy.

Keep a running list of saved-but-undeployed site changes, so the owner knows what the next
batch contains.

## Pending for the next deploy

1. Records links follow-up: Monroe's short MLS parcel numbers matched to the state's longer IDs
   (restores record values and tax-bill links lost in the Nov 25 deploy); unit check where the
   county record shows a unit (letter prefixes like Key West's "R1" allowed); Indian River ".0"
   restored when the MLS drops it; MATCH_VERSION 4.
2. Payment estimates use this week's 30-year mortgage rate (Freddie Mac via FRED, /api/rates),
   with the rate and week shown under the listing calculator (was a fixed 6.4%).
3. "Flood & elevation" section on listing pages: ground elevation (USGS 3DEP via /api/elevation,
   Open Topo Data fallback), the listing's flood zone, and a FEMA flood map link for the address.
4. "Solar potential" section on house listings (Google Solar API via /api/solar/:key). Off until
   GOOGLE_SOLAR_API_KEY is set in Netlify; 30-day cache; SOLAR_MONTHLY_CAP (default 2,000 calls).
5. "Commute" search menu: homes within 10-60 min by car/bike/walking of a typed place
   (OpenRouteService via /api/commute, area drawn on the map, kept in the URL). Hidden until
   ORS_API_KEY is set; 30-day cache; COMMUTE_DAILY_CAP (default 400 calls). /api/features tells
   the page which optional features are on.

(Last deploy, Nov 25 2026: tour bar street + city; records links by MLS parcel number;
/CLAUDE.md and /tests/* blocked on the site.)
