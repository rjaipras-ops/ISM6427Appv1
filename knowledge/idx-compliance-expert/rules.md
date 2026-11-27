# IDX display rules: working summary

Summaries for review work, not the rule text. Check the current BeachesMLS and Miami MLS (SEFMLS)
IDX rules before relying on a detail, and ask the owner when unsure.

| Rule (as summarized) | How itoured.com meets it |
|---|---|
| Brokerage clearly identified, visible on arrival (BeachesMLS 20.2.5; confirmed with BeachesMLS staff) | "LoKation Real Estate" in the header on every screen size; also on city/listing/review pages' top bar |
| No seller or occupant names on IDX displays (BeachesMLS 20.3.8) | Owner names are never shown; the county appraiser link shows them on the county's site |
| Listing brokerage attribution on each listing | "Courtesy of <office>" on cards; "Listing courtesy of" on listing pages |
| BMLS logo and disclaimer; data freshness | Logo, required disclaimer (English wording kept exactly, also on the Spanish site), last-updated time |
| Seller opted out of internet display (InternetEntireListingDisplayYN = false) | Listing is not shown |
| Address withheld (InternetAddressDisplayYN = false) | No address, no county record links (they would reveal it) |
| Automated value estimates next to listings (SEFMLS restriction; broker opt-out under NAR IDX policy) | None shown. Tax estimates and public-record values are labeled "not from BeachesMLS" |
| Impossible MLS values (lot size typed in the wrong unit) | Not shown and not converted: "Lot size unclear" with a pointer to the county record (js/lotsize.js). Converting the value would change MLS data, so ask BeachesMLS before doing that |
| Non-MLS content distinguished | Public records, tax estimates, imagery, reviews labeled as not from BeachesMLS |

Open questions are in `open-questions.md`.
