# Public records: sources and lessons

## Data
- Florida DOR tax roll files: NAL (parcels) and SDF (sales), per county, 2026 final roll. The daily
  record check downloads them only when DOR posts newer ones.
- Field meanings: DOR "2026 NAL, SDF and NAP Users Guide". TOT_LVG_AREA is total EFFECTIVE area
  (includes factored garage, porches), so it normally exceeds MLS living area.
- Sales in the files cover the year before January 1 of the roll year through the file date.
- Millage: county appraiser tax-authority tables (config/millage-2026.json, with URLs and dates).
- Homestead: $25,000 + additional $26,411 (2026, CPI-indexed), DOR sources in config.
- Cost-of-sale adjustment (DR-493, 2026): Palm Beach 15%, Broward 10%, Miami-Dade 15%.

## Matching lessons (Nov 2026)
- MLS parcel number first (98% match), with a house-number check and, where the record shows a
  unit, a unit check (letter prefixes allowed: Key West "R1" = listing "1").
- Broward folios contain letters: compare letters and digits, never digits only.
- Monroe MLS numbers are the 14-digit RE number; the state layer prefixes it.
- Indian River IDs really end in ".0"; restore it when the MLS drops the dot.
- Miami-Dade condo units are not in the statewide parcel layer: show the number and county links.
- Unit numbers after numbered roads (A1A, State Road 7, US Highway 1) need special parsing.

## County links (checked with real parcels, Nov 2026)
Miami-Dade, Broward, St. Lucie, Monroe, Indian River, Lee and Collier tax bills open by parcel.
Palm Beach and Martin tax sites are search-only. Lee and Collier appraisers can't be opened by
parcel number. Automated visits to county sites only where their terms allow.

## Record check tuning
New construction, teardowns, detached condos, co-op homes, condo-hotel units and farm-classified
homes are not flagged. Non-market transfers are not resales. Tune from the owner's false alarms.
