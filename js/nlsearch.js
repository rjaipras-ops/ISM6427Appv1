// Plain-English search: turns a typed request such as "3 bedrooms, no HOA, pool under 500k in
// Boca Raton" into the site's normal filters. This is pattern matching, not AI: it recognises
// common phrases and reports back exactly what it understood and what it skipped.

const SQFT_PER_ACRE = 43560;
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, single: 1 };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const money = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

// "$500k", "500,000", "1.2m", "1.2 million", "450 thousand"
const MONEY = String.raw`\$?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|mm|mil|million|thousand|grand)?\b`;
function toMoney(num, unit, { assumeThousands = false } = {}) {
  let n = parseFloat(String(num).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const u = (unit || "").toLowerCase();
  if (u === "k" || u === "thousand" || u === "grand") n *= 1e3;
  else if (u) n *= 1e6;
  else if (assumeThousands && n < 10000) n *= 1e3; // "under 500" about a home price means $500,000
  return Math.round(n);
}

// Searching by who lives somewhere (or by safety) isn't something a brokerage site may do.
const BLOCKED = /\b(safe(st|r)?|safety|(low |no |high )?crime|dangerous|sketchy|ghetto|family[- ]friendly|good for (families|kids|children)|no (kids|children)|adults? only|kid[- ]friendly|(white|black|hispanic|latino|asian|jewish|christian|muslim|catholic|ethnic|immigrant|gay|lgbtq?|english[- ]speaking)( \w+)? (people|neighbou?rs?|neighbou?rhoods?|areas?|families|communit(y|ies)|residents)|church(es)?|synagogues?|mosques?|temples?)\b/;

const FEATURES = [
  // [pattern, filter key, label]
  [/\b(private |swimming |heated |salt ?water )?pool\b/, "pool", "Pool"],
  [/\b(water ?front|on the water|canal ?front|lake ?front|ocean ?front|intracoastal)\b/, "waterfront", "Waterfront"],
  [/\b(ocean|gulf) access\b/, "oceanAccess", "Ocean access"],
  [/\b(boat )?dock\b|\bboat (slip|lift)\b/, "boatDock", "Boat dock"],
  [/\bgolf( course| community)?\b/, "golf", "Golf community"],
  [/\bgated( community)?\b|\bguard gated?\b/, "gated", "Gated community"],
  [/\bfire ?place\b/, "fireplace", "Fireplace"],
  [/\b(impact|hurricane)( resistant)? (windows?|glass|doors?)\b/, "impactWindows", "Impact windows"],
  [/\bsolar( panels?| power(ed)?)?\b/, "solar", "Solar panels"],
  [/\b(ev|electric (car|vehicle)) charg(er|ing)\b/, "ev", "EV charging"],
  [/\b(new construction|newly built|brand new|new build)\b/, "newConstruction", "New construction"],
  [/\b(price (reduced|reduction|cut|drop)|reduced price|reduced)\b/, "priceReduced", "Price reduced"],
  [/\bopen house\b/, "openHouse", "Open house"],
  [/\b(foreclosures?|bank owned|reo)\b/, "foreclosure", "Foreclosure"],
  [/\b(virtual|3d) tour\b/, "virtualTour", "Virtual tour"],
  [/\b(water|ocean|lake|golf|city|skyline|bay) views?\b|\bwith (a )?views?\b/, "view", "Has a view"],
  [/\b(cbs|concrete block)( construction)?\b/, "cbs", "CBS construction"],
  [/\b(short term rentals?|airbnb|vrbo|str allowed)\b/, "str", "Short-term rentals allowed"],
  [/\b(central (air|a c|ac)|air conditioning)\b/, "centralAir", "Central air"],
  [/\bbasement\b/, "basement", "Basement"],
];

const TYPES = [
  [/\bsingle[- ]family( homes?| houses?)?\b|\bdetached (homes?|houses?)\b/, "Single Family"],
  [/\bcondos?\b|\bcondominiums?\b|\bapartments?\b/, "Condo"],
  [/\btown ?(houses?|homes?)\b|\bvillas?\b/, "Townhouse"],
  [/\b(duplex(es)?|triplex(es)?|fourplex|multi[- ]?family)\b/, "Multi-Family"],
  [/\b(mobile|manufactured)( homes?)?\b/, "Mobile/Manufactured"],
  [/\b(vacant )?(land|lots?)( for sale)?\b|\bacreage\b/, "Land"],
];

const STOP = new Set(("find show me give get see list listings listing homes home houses house properties property places place for sale with and a an the in that have has having i we want need looking look search "
  + "please at least or more of to near around is are which any some all my our us on it this these those something anything be can you would like there who where do does also but only just "
  + "really neighborhood neighbourhood community communities area areas payment payments story stories built bedroom bedrooms bathroom bathrooms nice good great not no without minimum maximum max min under over above below than less up price priced cost costs asking").split(" "));

/**
 * @param {string} text  what the user typed
 * @param {{cities?: string[], counties?: string[]}} places  names present in the listings
 * @returns {{patch: object, understood: string[], skipped: string[], blocked: boolean, isPrompt: boolean}}
 */
export function parseSearch(text, { cities = [], counties = [] } = {}) {
  // Keep $ , . / + - (they matter for "$3,000/mo" and "55+"); everything else becomes a space.
  let t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9 $,./+\-]/g, " ").replace(/(\d),(?=\d{3})/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ")} `;
  const placeRe = (name, tail = "") => new RegExp(`\\b${norm(name).split(" ").join("[ .\\-]+")}\\.?${tail}(?![a-z0-9])`);
  const patch = {}, understood = [], skipped = [];
  let filterHits = 0;
  // Replace the first match of `re` with a space and return the match (so text isn't read twice).
  const take = (re) => { const m = t.match(re); if (m) t = t.replace(m[0], " "); return m; };
  const hit = (obj, label) => { Object.assign(patch, obj); understood.push(label); filterHits++; };

  const blocked = BLOCKED.test(t);
  if (blocked) t = t.replace(new RegExp(BLOCKED.source, "g"), " ");

  // ----- location: ZIP, county, city (before numbers are read as prices) -----
  let m;
  if ((m = take(/\b(3[0-4]\d{3})\b/))) { patch.q = m[1]; understood.push(`ZIP ${m[1]}`); }
  for (const c of [...counties].sort((a, b) => b.length - a.length)) {
    const n = norm(c);
    if (!n) continue;
    // "Palm Beach" alone is the town; the county needs the word "county".
    const tail = n === "palm beach" || n === "martin" ? " county" : "( county)?";
    const re = n === "miami dade" ? /\b(miami[ -]dade|dade)( county)?(?![a-z0-9])/ : placeRe(c, tail);
    if (re.test(t)) {
      t = t.replace(re, " ");
      patch.counties = [...(patch.counties || []), c]; understood.push(`${c} County`); filterHits++;
    }
  }
  if (!patch.q) {
    const city = [...cities].filter((c) => c && c.length > 2).sort((a, b) => b.length - a.length).find((c) => placeRe(c).test(t));
    if (city) { t = t.replace(placeRe(city), " "); patch.q = city; understood.push(city); }
  }

  // ----- monthly payment -----
  if ((m = take(new RegExp(String.raw`(?:payment|monthly)?\s?(?:under|below|less than|up to|max(?:imum)?(?: of)?|no more than)?\s?${MONEY}\s?(?:\/|per |a |each )?\s?(?:mo|month|monthly)\b(?: payment)?`)))) {
    const n = toMoney(m[1], m[2]);
    if (n) hit({ payMax: n }, `Payment up to ${money(n)}/mo`);
  }

  // ----- HOA -----
  if (take(/\b(no|without|zero|w o)( an| any| monthly)? (hoa|h o a|association|condo|maintenance)( fees?| dues)?\b|\bhoa free\b|\bno fees?\b/)) hit({ hoaMax: 0 }, "No HOA fee");
  else if ((m = take(new RegExp(String.raw`\b(?:hoa|association|condo fees?|maintenance)(?: fees?| dues)?\s?(?:is |of )?(?:under|below|less than|up to|max(?:imum)?(?: of)?|no more than)\s?${MONEY}`)))) {
    const n = toMoney(m[1], m[2]); if (n != null) hit({ hoaMax: n }, `HOA up to ${money(n)}/mo`);
  } else if (take(/\blow (hoa|association|condo|maintenance)( fees?| dues)?\b/)) hit({ hoaMax: 300 }, "HOA up to $300/mo");

  // ----- beds / baths -----
  const NUM = String.raw`(\d+(?:\.\d)?|one|two|three|four|five|six)`;
  const num = (s) => WORD_NUM[s] ?? parseFloat(s);
  if ((m = take(/\b(\d)\s?\/\s?(\d)(?:\.5)?\b/))) hit({ bedsMin: +m[1], bathsMin: +m[2] }, `${m[1]}+ beds, ${m[2]}+ baths`);
  if ((m = take(new RegExp(String.raw`\b${NUM}\s?\+?\s?(?:or more )?(?:bed ?rooms?|beds?|br|bd|bdrm)s?\b`)))) { const n = Math.floor(num(m[1])); if (n >= 1 && n <= 10) hit({ bedsMin: n }, `${n}+ beds`); }
  if ((m = take(new RegExp(String.raw`\b${NUM}\s?\+?\s?(?:or more )?(?:full )?(?:bath ?rooms?|baths?|ba)\b`)))) { const n = Math.floor(num(m[1])); if (n >= 1 && n <= 10) hit({ bathsMin: n }, `${n}+ baths`); }

  // ----- size, lot, year, garage, stories -----
  const SQ = String.raw`(?:sq\.? ?ft\.?|sqft|square (?:feet|foot)|sf)`;
  if ((m = take(new RegExp(String.raw`\b(under|below|less than|up to|max(?:imum)?)\s?(\d[\d,]{2,})\s?${SQ}`)))) { const n = +m[2].replace(/,/g, ""); hit({ sqftMax: n }, `Up to ${n.toLocaleString("en-US")} sq ft`); }
  else if ((m = take(new RegExp(String.raw`\b(?:over|above|more than|at least|min(?:imum)?)?\s?(\d[\d,]{2,})\s?\+?\s?${SQ}`)))) { const n = +m[1].replace(/,/g, ""); hit({ sqftMin: n }, `${n.toLocaleString("en-US")}+ sq ft`); }
  if ((m = take(/\b(half|quarter|\d+(?:\.\d+)?|one|two|three|four|five)\s?\+?\s?(an )?acres?\b/))) {
    const a = m[1] === "half" ? 0.5 : m[1] === "quarter" ? 0.25 : num(m[1]);
    if (a > 0) hit({ lotMin: Math.round(a * SQFT_PER_ACRE) }, `Lot ${a}+ acre${a > 1 ? "s" : ""}`);
  }
  if ((m = take(/\b(?:built|constructed)?\s?(after|since|newer than|in or after|from)\s((?:19|20)\d{2})\b/))) hit({ yearMin: +m[2] }, `Built ${m[2]} or later`);
  if ((m = take(/\b(?:built|constructed)?\s?(before|older than|prior to)\s((?:19|20)\d{2})\b/))) hit({ yearMax: +m[2] }, `Built ${m[2]} or earlier`);
  if ((m = take(new RegExp(String.raw`\b${NUM}\s?\+?[- ]?car garage\b`)))) { const n = Math.floor(num(m[1])); hit({ garageMin: n }, `${n}+ car garage`); }
  else if (take(/\bno garage\b/)) skipped.push("no garage");
  else if (take(/\bgarage\b/)) hit({ garageMin: 1 }, "Garage");
  if (take(/\b(single|one|1)[- ]stor(y|ey)\b|\branch( style)?\b/)) hit({ stories: "single" }, "Single story");
  else if (take(/\b(two|2|three|3|multi)[- ]stor(y|ey)\b/)) hit({ stories: "multi" }, "Multi-story");

  // ----- price -----
  const P = { assumeThousands: true };
  if ((m = take(new RegExp(String.raw`\b(?:between|from)\s?${MONEY}\s?(?:and|to|-)\s?${MONEY}`))) || (m = take(new RegExp(String.raw`${MONEY}\s?(?:to|-)\s?${MONEY}`)))) {
    let hi = toMoney(m[3], m[4], P), lo = toMoney(m[1], m[2] || m[4], P);
    if (lo && hi) { if (lo > hi) [lo, hi] = [hi, lo]; hit({ priceMin: lo, priceMax: hi }, `${money(lo)} to ${money(hi)}`); }
  } else {
    if ((m = take(new RegExp(String.raw`\b(?:under|below|less than|up to|max(?:imum)?(?: of| price)?|no more than|budget(?: of| is)?|cheaper than)\s?${MONEY}`)))) { const n = toMoney(m[1], m[2], P); if (n) hit({ priceMax: n }, `Up to ${money(n)}`); }
    if ((m = take(new RegExp(String.raw`\b(?:over|above|more than|at least|min(?:imum)?(?: of| price)?|starting at|from)\s?${MONEY}`)))) { const n = toMoney(m[1], m[2], P); if (n) hit({ priceMin: n }, `${money(n)} or more`); }
    if (patch.priceMax == null && patch.priceMin == null && (m = take(new RegExp(String.raw`(?:\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million|thousand)?|\b(\d[\d,]*(?:\.\d+)?)\s?(k|m|million|thousand))\b`)))) {
      const n = toMoney(m[1] ?? m[3], m[2] ?? m[4], P); if (n) hit({ priceMax: n }, `Up to ${money(n)}`);
    }
  }

  // ----- senior communities, flood zone, reviews, timing, status, sort -----
  if (take(/\b(no|not|non|exclude|without|hide)( a| in a| in)? ?(55 ?\+?|55 and (over|older)|senior|age restricted|retirement)\s*(communit(y|ies)|homes?|housing)?(?![a-z0-9])/)) hit({ hideSenior: true }, "Hide 55+ communities");
  else if (take(/\b(55 ?\+|55 and (over|older)|senior|age restricted|retirement)\s*(communit(y|ies)|homes?|housing)?(?![a-z0-9])/)) skipped.push("55+ communities only (the site can hide them, not show only them)");
  if (take(/\b(not in|no|outside( of)?|out of|low risk|minimal)( a| the)? flood( zone| risk)?\b|\bflood zone x\b/)) hit({ noFloodZone: true }, "Not in a flood zone");
  if (take(/\b(with|has|have|having)( tour)? reviews?\b|\breviewed\b|\btour reviews?\b/)) hit({ reviewedOnly: true }, "Has tour reviews");
  if (take(/\b(listed|new) today\b|\blast 24 hours\b/)) hit({ domMax: 1 }, "Listed in the last day");
  else if (take(/\b(new listings?|newly listed|just listed|this week|last (7|seven) days|past week)\b/)) hit({ domMax: 7 }, "Listed in the last 7 days");
  else if (take(/\b(last|past) (30 days|month)\b|\bthis month\b/)) hit({ domMax: 30 }, "Listed in the last 30 days");
  if (take(/\b(pending|under contract)\b/)) hit({ statusPending: true }, "Include pending");
  if (take(/\b(cheapest|lowest price(d)?|least expensive)\b/)) hit({ sort: "priceAsc" }, "Cheapest first");
  else if (take(/\b(most expensive|highest price(d)?|priciest)\b/)) hit({ sort: "priceDesc" }, "Most expensive first");
  else if (take(/\b(newest|most recent|latest)\b/)) hit({ sort: "newest" }, "Newest first");
  else if (take(/\b(biggest|largest)\b/)) hit({ sort: "sqft" }, "Largest first");

  // ----- home type -----
  for (const [re, type] of TYPES) if (take(re)) { patch.types = [...(patch.types || []), type]; understood.push(type); filterHits++; }

  // ----- features ("no pool" can't be filtered: say so rather than doing the opposite) -----
  for (const [re, key, label] of FEATURES) {
    const neg = new RegExp(String.raw`\b(no|not|without|w o)( a| an| any)? ` + re.source.replace(/^\\b/, ""));
    if (take(neg)) { skipped.push(`no ${label.toLowerCase()} (the site can only require a feature, not exclude it)`); while (take(re)); continue; }
    if (take(re)) hit({ [key]: true }, label);
  }

  // ----- whatever is left: search listing descriptions for it -----
  const rest = norm(t).split(" ").filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  if (rest.length && rest.length <= 4 && filterHits) { patch.keyword = rest.join(" "); understood.push(`Description mentions “${rest.join(" ")}”`); }
  else if (rest.length && filterHits) skipped.push(rest.join(" "));

  // `complete`: every part of the request became a filter, so there's nothing for the AI to add.
  const complete = filterHits > 0 && !skipped.length && !patch.keyword && !blocked;
  return { patch, understood, skipped, blocked, isPrompt: filterHits > 0 || blocked, complete, words: norm(text).split(" ").filter(Boolean).length };
}
