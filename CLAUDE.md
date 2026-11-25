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

Nothing yet. (Last deploy, Nov 25 2026: tour bar street + city; records links by MLS parcel number;
/CLAUDE.md and /tests/* blocked on the site.)
