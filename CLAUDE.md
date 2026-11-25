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

1. Tour bar on phone listing pages shows "street, city" (was street only).
2. /CLAUDE.md returns 404 on the site (netlify.toml).
3. Records links on listing pages: parcel found by the MLS parcel number (exact condo unit, with a
   house-number check), number-only display with direct links where the state map lacks the unit
   (Miami-Dade condos), unit parsing after numbered roads (A1A, State Road 7), Lee and Collier
   tax-bill links, MATCH_VERSION 3 (cached matches redone once).
4. /tests/* returns 404 on the site (netlify.toml).
