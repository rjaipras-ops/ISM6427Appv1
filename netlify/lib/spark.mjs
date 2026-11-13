// Spark / Flexmls WebAPI client (server-side only).
// Supports the RESO Web API (…/Reso/OData/Property) and the Spark REST API (…/v1/listings).
// Credentials come from the environment and are only ever sent to the Spark API.

import { idxConfig, ACTIVE } from "./config.mjs";

// Fields the app uses. Anything else stays in the MLS.
export const RESO_SELECT = [
  "ListingKey", "ListingId", "StandardStatus", "MlsStatus", "ListPrice", "OriginalListPrice",
  "UnparsedAddress", "StreetNumber", "StreetName", "UnitNumber", "City", "StateOrProvince", "PostalCode", "CountyOrParish",
  "SubdivisionName", "Latitude", "Longitude",
  "PropertyType", "PropertySubType", "BedroomsTotal", "BathroomsTotalInteger", "BathroomsFull", "BathroomsHalf",
  "LivingArea", "LotSizeAcres", "YearBuilt", "StoriesTotal", "GarageSpaces",
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount", "PoolPrivateYN", "WaterfrontYN", "View",
  "FireplaceYN", "Cooling", "NewConstructionYN", "SeniorCommunityYN", "ArchitecturalStyle",
  "PublicRemarks", "DaysOnMarket", "OnMarketDate", "ListingContractDate",
  "ListOfficeName", "ListOfficePhone", "ListOfficeEmail", "ListAgentFullName",
  "VirtualTourURLUnbranded", "ModificationTimestamp", "PhotosChangeTimestamp", "PhotosCount",
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `deadline` (ms timestamp): never wait past it, so a slow response can't push a scheduled
// function over Netlify's 30-second limit (which would lose the whole run's progress).
export async function sparkGet(url, { attempts = 4, deadline } = {}) {
  const cfg = idxConfig();
  if (cfg.mock) throw new Error("sparkGet called in mock mode");
  const left = () => (deadline ? deadline - Date.now() : 25000);
  for (let attempt = 1; ; attempt++) {
    if (left() < 1500) throw new Error("Out of time for this run (will continue next run)");
    let res;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(Math.min(25000, left())),
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "X-SparkApi-User-Agent": cfg.userAgent,
          Accept: "application/json",
        },
      });
    } catch (e) {
      if (attempt >= attempts || left() < 1000 * 2 ** attempt + 3000) throw e;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    // Rate limited or temporary server trouble: back off and retry.
    if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      if (left() < wait + 3000) throw new Error(`Spark API ${res.status} (will retry next run)`);
      await sleep(wait);
      continue;
    }
    const body = await res.text().catch(() => "");
    // Never echo the token; the body is the API's own error message.
    throw new Error(`Spark API ${res.status}: ${body.slice(0, 300)}`);
  }
}

// Query strings with spaces encoded as %20 (not "+"): not every OData server treats "+" as a space.
const qs = (params) => Object.entries(params)
  .map(([k, v]) => `${k.startsWith("$") ? k : encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

const odataQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sparkQuote = (s) => `'${String(s).replace(/'/g, "\\'")}'`;

function resoAreaFilter(cfg) {
  const counties = cfg.counties.map((c) => `CountyOrParish eq ${odataQuote(c)}`).join(" or ");
  const types = cfg.propertyTypes.map((t) => `PropertyType eq ${odataQuote(t)}`).join(" or ");
  return [counties && `(${counties})`, types && `(${types})`].filter(Boolean).join(" and ");
}

function sparkAreaFilter(cfg) {
  const counties = cfg.counties.map((c) => `CountyOrParish Eq ${sparkQuote(c)}`).join(" Or ");
  const types = cfg.propertyTypes.map((t) => `PropertyType Eq ${sparkQuote(t)}`).join(" Or ");
  return [counties && `(${counties})`, types && `(${types})`].filter(Boolean).join(" And ");
}

/**
 * Builds the first-page URL for a query.
 *  kind "active": every active listing (initial sync), with photos.
 *  kind "changed": anything modified or re-photographed since `since` (any status, so
 *                  listings that went off-market show up and can be purged), with photos.
 *  kind "keys":    keys of every active listing (nightly reconcile), no photos.
 */
export { qs };

export function firstPageUrl(kind, { since } = {}) {
  const cfg = idxConfig();
  if (cfg.flavor === "reso") {
    const area = resoAreaFilter(cfg);
    let filter;
    if (kind === "changed") filter = `(ModificationTimestamp gt ${since} or PhotosChangeTimestamp gt ${since})${area ? ` and ${area}` : ""}`;
    else filter = `StandardStatus eq ${odataQuote(ACTIVE)}${area ? ` and ${area}` : ""}`;
    const p = { $filter: filter, $top: String(cfg.pageSize) };
    if (kind === "keys") p.$select = "ListingKey";
    else {
      p.$select = RESO_SELECT.join(",");
      // Bulk sync only needs the cover photo; the full gallery is fetched when a listing is opened.
      // (Expanding every photo makes each page ~35x larger and the initial load far slower.)
      p.$expand = "Media($select=MediaURL,Order,MediaCategory,PreferredPhotoYN;$orderby=Order;$top=1)";
    }
    return `${cfg.baseUrl}/Property?${qs(p)}`;
  }
  // Spark REST API
  const area = sparkAreaFilter(cfg);
  let filter;
  if (kind === "changed") filter = `(ModificationTimestamp Gt ${since} Or PhotosChangeTimestamp Gt ${since})${area ? ` And ${area}` : ""}`;
  else filter = `StandardStatus Eq ${sparkQuote(ACTIVE)}${area ? ` And ${area}` : ""}`;
  const p = { _filter: filter, _limit: String(Math.min(cfg.pageSize, 25)), _pagination: "1", _page: "1" };
  if (kind === "keys") p._select = "ListingKey";
  else p._expand = "PrimaryPhoto,Photos";
  return `${cfg.baseUrl}/listings?${qs(p)}`;
}

/** Fetches one page; returns { records, next } where next is the following page URL or null. */
export async function fetchPage(url, { deadline } = {}) {
  const cfg = idxConfig();
  const json = await sparkGet(url, { deadline });
  if (cfg.flavor === "reso") {
    return { records: json.value || [], next: json["@odata.nextLink"] || null };
  }
  const d = json.D || json.d || {};
  const records = (d.Results || []).map((r) => ({ ...(r.StandardFields || {}), ListingKey: r.StandardFields?.ListingKey || r.Id }));
  const pg = d.Pagination;
  let next = null;
  if (pg && pg.CurrentPage < pg.TotalPages) next = url.replace(/([?&]_page=)\d+/, `$1${pg.CurrentPage + 1}`);
  return { records, next };
}
