# MLS feed notes

- RESO Web API (replication endpoint). Token in Netlify `SPARK_API_BEARER_TOKEN` and the GitHub
  secret of the same name (daily record check). Never print it.
- Active listings statewide; property types Residential, Residential Income, Land, Farm
  (INDEX_SCHEMA 6). The search index is a compact subset; full records are fetched when a listing
  page opens and cached for one sync interval.
- `ParcelNumber` is in the feed (confirmed Nov 2026); listing pages use it for county record links.
- Sync: every 5 minutes (changes since last run), daily reconcile of active keys.
- Rate limit: two full pulls of ~45,000 listings within 20 minutes got HTTP 429 (Nov 24, 2026).
  The daily record check now selects ~30 fields, waits 3 s between pages and honors Retry-After.
- Optional structure fields (Roof, FoundationDetails, WindowFeatures) are requested with a
  fallback if the feed rejects them (HTTP 400).
- County names come without " County" (Palm Beach, Broward, Miami-Dade).
