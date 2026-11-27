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

(Nothing yet.)

(Last deploy, Nov 27 2026: header language switch (English | Español on tablet/desktop, EN | ES on
phones) and the phone logo lockup with "LoKation Real Estate" under "iToured".)

## Credits warning

The owner wants to be told when about **60 credits** are left for deploys (4 deploys). Deploys are
15 credits each, but the account's other usage (functions, bandwidth, form submissions) also uses
credits, so the real balance is on Netlify (Team settings → Billing / Usage), not in this repo.
Before each deploy, if the owner has given a recent balance, subtract 15 per deploy since then and
warn at 60 or below. Deploy log (this billing period, resets monthly):
- Nov 25 2026, Nov 26 2026, Nov 27 2026 (header switch).

## Agent team

Agent definitions are in `.claude/agents/` (orchestrator first for multi-part work; the two
compliance reviewers and security-expert review, they don't edit). Each agent's notes are in
`knowledge/<agent>/`: public-safe summaries only.
