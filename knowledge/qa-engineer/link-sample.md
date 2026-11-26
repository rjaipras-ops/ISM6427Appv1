# County-link sample check

After a deploy that touches records links: pick 3 current listings per county (2 condos, 1 house)
in Miami-Dade, Broward, Palm Beach, St. Lucie, Martin, Lee, Collier, Monroe and Indian River.
Call `/api/idx/parcel/<key>` on the live site, then open a few of the links and confirm the
county page shows the same parcel and address. Report a before/after table.

Nov 25, 2026 baseline: 26 of 27 matched (was 13); Lee condo 4105 Residence Dr 117 has an MLS
parcel number for unit 717 (MLS data issue, can't be checked automatically in Lee).
