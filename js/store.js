// Data access layer.
//
// Everything the UI needs from a backend goes through this file, so swapping
// the browser-only demo for real auth + a database (Supabase, Firebase,
// Netlify Identity + Functions, etc.) only means re-implementing these
// functions. See db/schema.sql for the matching tables.
//
// Demo behaviour: the "session", reviews and saved homes live in localStorage,
// so they exist only in the current browser.

const KEYS = {
  user: "toured.user",
  reviews: "toured.reviews.sfl", // bumped when sample data changed
  saved: "toured.saved",
  helpful: "toured.helpful",
};

export const RATING_CATEGORIES = [
  { key: "overall", label: "Overall" },
  { key: "condition", label: "Condition & upkeep" },
  { key: "matchesListing", label: "Matches the listing" },
  { key: "layout", label: "Layout & natural light" },
  { key: "neighborhood", label: "Street & neighborhood" },
  { key: "noise", label: "Quietness" },
];

export const TOUR_TYPES = {
  open_house: "Open house",
  private_showing: "Private showing with an agent",
  builder_tour: "Builder / model tour",
};

export const REVIEW_TAGS = [
  "Looks like the photos", "Smaller than expected", "Bigger than expected", "Great natural light",
  "Needs updating", "Recently renovated", "Strong odors", "Signs of water damage", "Busy street",
  "Quiet street", "Great yard", "Low ceilings", "Storage galore", "Parking is tight",
  "Friendly neighbors", "Flood-zone concerns", "Impact windows", "Older roof", "Special assessment risk",
  "Boat-friendly canal",
];

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

/* ---------------- Auth ---------------- */
const listeners = new Set();
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn(getUser()));

export function getUser() { return read(KEYS.user, null); }

// Replace with your provider's sign-in. Must resolve to { id, displayName, email }.
export async function signIn({ displayName, email }) {
  const existing = getUser();
  const user = {
    id: existing?.email === email ? existing.id : uid(),
    displayName: displayName.trim(),
    email: email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  write(KEYS.user, user);
  emit();
  return user;
}

export async function signOut() {
  try { localStorage.removeItem(KEYS.user); } catch { /* ignore */ }
  emit();
}

/* ---------------- Reviews ---------------- */
// Clearly-labelled sample reviews so the design shows a populated state.
// They render with a "Sample" flag and should be deleted once real reviews exist.
const SAMPLE_REVIEWS = [
  {
    listingId: "43101364", displayName: "Marisol P.", daysAgo: 6, tourType: "open_house", tourDaysAgo: 9,
    ratings: { overall: 5, condition: 5, matchesListing: 4, layout: 5, neighborhood: 5, noise: 3 },
    title: "Renovated Victoria Park gem, but Sunrise Blvd noise",
    body: "Kitchen and baths are fully redone and the roof is 2022 per the disclosure. Impact windows throughout, which keep the noise down, but you still hear Sunrise traffic in the front bedroom at rush hour.",
    pros: "Renovation, walk to Las Olas, impact windows", cons: "Traffic noise in front bedroom",
    tags: ["Recently renovated", "Great natural light", "Busy street"],
  },
  {
    listingId: "43101364", displayName: "Devin K.", daysAgo: 3, tourType: "private_showing", tourDaysAgo: 4,
    ratings: { overall: 4, condition: 4, matchesListing: 4, layout: 4, neighborhood: 5, noise: 3 },
    title: "Photos are accurate, yard is tight",
    body: "Wide-angle photos make the backyard look bigger than it is. No room for a pool. Inside matched the listing well and the AC is about 3 years old.",
    pros: "Move-in ready", cons: "Small yard, street parking only",
    tags: ["Looks like the photos", "Parking is tight"],
  },
  {
    listingId: "46499454", displayName: "Andre W.", daysAgo: 12, tourType: "open_house", tourDaysAgo: 13,
    ratings: { overall: 4, condition: 4, matchesListing: 5, layout: 5, neighborhood: 5, noise: 5 },
    title: "Quiet West Boca cul-de-sac, ask about club dues",
    body: "Lovely lake view and a very quiet street. Layout flows great for entertaining. Make sure you get the mandatory club membership and capital contribution numbers before you write an offer.",
    pros: "Lake view, layout, quiet", cons: "Mandatory club costs",
    tags: ["Quiet street", "Looks like the photos"],
  },
  {
    listingId: "43209846", displayName: "Priya S.", daysAgo: 20, tourType: "private_showing", tourDaysAgo: 22,
    ratings: { overall: 3, condition: 2, matchesListing: 2, layout: 3, neighborhood: 4, noise: 3 },
    title: "Great beach location, ask about the assessment",
    body: "Steps to the beach, but the unit is darker and more dated than the photos suggest. The building is mid-way through its milestone inspection and concrete restoration, and a special assessment was mentioned. Get the SIRS report and the latest condo minutes.",
    pros: "Beach access, price", cons: "Dated unit, likely special assessment",
    tags: ["Needs updating", "Smaller than expected"],
  },
  {
    listingId: "47835617", displayName: "Tom R.", daysAgo: 2, tourType: "open_house", tourDaysAgo: 2,
    ratings: { overall: 5, condition: 4, matchesListing: 5, layout: 4, neighborhood: 4, noise: 4 },
    title: "Solid PSL pool home, exactly like the photos",
    body: "Clean, newer roof and the pool cage is in good shape. Exactly what the listing shows. On city water and sewer, which isn't true for every PSL lot, so worth confirming on others.",
    pros: "Pool, condition, city water/sewer", cons: "Kitchen is builder-grade",
    tags: ["Looks like the photos", "Great yard"],
  },
  {
    listingId: "43004143", displayName: "Jasmine L.", daysAgo: 30, tourType: "open_house", tourDaysAgo: 31,
    ratings: { overall: 2, condition: 2, matchesListing: 3, layout: 3, neighborhood: 3, noise: 4 },
    title: "Musty smell, check for water intrusion",
    body: "Strong musty odor in the second bedroom and staining on the ceiling near the AC closet. Might be fine after inspection, but go in with eyes open and ask the association about recent leaks.",
    pros: "Price, quiet building", cons: "Odor, possible leak",
    tags: ["Strong odors", "Signs of water damage", "Quiet street"],
  },
];

function seededSamples() {
  const now = Date.now();
  return SAMPLE_REVIEWS.map((s, i) => ({
    id: `sample-${i}`,
    listingId: s.listingId,
    userId: `sample-user-${i}`,
    displayName: s.displayName,
    createdAt: new Date(now - s.daysAgo * 864e5).toISOString(),
    tour: { date: new Date(now - s.tourDaysAgo * 864e5).toISOString().slice(0, 10), type: s.tourType },
    certification: { certified: true, method: "self", certifiedAt: new Date(now - s.daysAgo * 864e5).toISOString() },
    ratings: s.ratings,
    title: s.title, body: s.body, pros: s.pros, cons: s.cons, tags: s.tags,
    helpful: 2 + ((i * 7) % 9),
    sample: true,
  }));
}

function allReviews() {
  let rows = read(KEYS.reviews, null);
  if (!rows) { rows = seededSamples(); write(KEYS.reviews, rows); }
  return rows;
}

export function getReviews(listingId) {
  return allReviews()
    .filter((r) => r.listingId === listingId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAllReviews() { return allReviews().slice(); }

export function getReviewsByUser(userId) {
  return allReviews().filter((r) => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Summary per listing: { [listingId]: { count, avg, cats: {key: avg} } }
export function getReviewSummaries() {
  const out = {};
  for (const r of allReviews()) {
    const s = (out[r.listingId] ||= { count: 0, sum: 0, cats: {} });
    s.count += 1;
    s.sum += r.ratings.overall;
    for (const { key } of RATING_CATEGORIES) {
      if (r.ratings[key] == null) continue;
      const c = (s.cats[key] ||= { sum: 0, n: 0 });
      c.sum += r.ratings[key]; c.n += 1;
    }
  }
  for (const s of Object.values(out)) {
    s.avg = s.sum / s.count;
    for (const k of Object.keys(s.cats)) s.cats[k] = s.cats[k].sum / s.cats[k].n;
    delete s.sum;
  }
  return out;
}

// Validation rules for a tour review. Mirror these server-side.
export function validateReview(input, { listing, user }) {
  const errors = [];
  if (!user) errors.push("Sign in to post a review.");
  if (!input.certified) errors.push("You must certify that you toured this home in person.");
  if (!TOUR_TYPES[input.tourType]) errors.push("Choose how you toured the home.");
  const today = new Date().toISOString().slice(0, 10);
  if (!input.tourDate) errors.push("Enter the date you toured the home.");
  else if (input.tourDate > today) errors.push("Tour date can't be in the future.");
  else if (new Date(input.tourDate) < new Date(Date.now() - 365 * 864e5)) errors.push("Tours must be within the last 12 months.");
  if (!input.ratings?.overall) errors.push("Give an overall rating.");
  if (!input.title || input.title.trim().length < 4) errors.push("Add a short headline.");
  if (!input.body || input.body.trim().length < 30) errors.push("Write at least 30 characters about the tour.");
  if (user && listing && allReviews().some((r) => r.listingId === listing.ListingId && r.userId === user.id)) {
    errors.push("You've already reviewed this home.");
  }
  return errors;
}

export async function addReview(input, { listing, user }) {
  const errors = validateReview(input, { listing, user });
  if (errors.length) throw Object.assign(new Error(errors[0]), { errors });
  const now = new Date().toISOString();
  const review = {
    id: uid(),
    listingId: listing.ListingId,
    address: listing.UnparsedAddress || null, // lets reviews of any home (not just listings) be listed
    userId: user.id,
    displayName: user.displayName,
    createdAt: now,
    tour: { date: input.tourDate, type: input.tourType },
    certification: {
      certified: true,
      method: "self", // later: "agent_confirmed" | "showing_service" (e.g. ShowingTime) | "geo_checkin"
      certifiedAt: now,
      statement: `I certify that I personally toured ${listing.UnparsedAddress} on ${input.tourDate}.`,
    },
    ratings: input.ratings,
    title: input.title.trim(),
    body: input.body.trim(),
    pros: (input.pros || "").trim(),
    cons: (input.cons || "").trim(),
    tags: input.tags || [],
    helpful: 0,
  };
  const rows = allReviews();
  rows.push(review);
  write(KEYS.reviews, rows);
  return review;
}

export async function deleteReview(id, user) {
  const rows = allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r || r.userId !== user?.id) return false;
  write(KEYS.reviews, rows.filter((x) => x.id !== id));
  return true;
}

export function markHelpful(id) {
  const voted = read(KEYS.helpful, []);
  if (voted.includes(id)) return false;
  const rows = allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r) return false;
  r.helpful = (r.helpful || 0) + 1;
  write(KEYS.reviews, rows);
  write(KEYS.helpful, [...voted, id]);
  return true;
}

/* ---------------- Saved homes ---------------- */
export function getSaved() { return new Set(read(KEYS.saved, [])); }
export function toggleSaved(listingId) {
  const s = getSaved();
  s.has(listingId) ? s.delete(listingId) : s.add(listingId);
  write(KEYS.saved, [...s]);
  return s.has(listingId);
}

/* ---------------- Listings ---------------- */
// Listings come from the site's IDX API (Netlify Functions → BeachesMLS / Flexmls Spark feed).
// If that API isn't available (e.g. the site is served by a plain static file server),
// the bundled demo data in data/listings.json is used instead.

// Rebuilds listing objects from the compact column format sent by /api/idx/listings.
function decodeIndex(data) {
  const fi = data.fields.indexOf("_flags");
  return data.rows.map((row) => {
    const l = { demo: {} };
    data.fields.forEach((f, i) => {
      if (i === fi) return;
      const [a, b] = f.split(".");
      if (b) l.demo[b] = row[i]; else l[a] = row[i];
    });
    data.flags.forEach((f, bit) => {
      const [a, b] = f.split(".");
      const v = Boolean(row[fi] & (1 << bit));
      if (b) l.demo[b] = v; else l[a] = v;
    });
    l.Source = "mls";
    l.ListingKey = l.ListingId;
    l.StateOrProvince = "FL";
    l.UnparsedAddress = l.AddressHidden ? `${l.City}, FL ${l.PostalCode}` : `${l.StreetAddress}, ${l.City}, FL ${l.PostalCode}`;
    l.PricePerSqFt = l.LivingArea ? Math.round(l.ListPrice / l.LivingArea) : 0;
    l.demo.OpenHouse = null;
    l.demo.PublicRemarks = null; // loaded with the listing details
    return l;
  });
}

/**
 * Loads all listings. Returns { mode: "live" | "mock" | "demo", lastSyncTimestamp, version, listings }.
 *  live = BeachesMLS feed, mock = test mode (no Spark token yet), demo = static fallback file.
 */
export async function loadFeed() {
  try {
    // "no-cache" revalidates with the server's ETag, so unchanged data isn't re-downloaded.
    const res = await fetch("/api/idx/listings", { cache: "no-cache", headers: { Accept: "application/json" } });
    if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
      const data = await res.json();
      return { mode: data.mode, lastSyncTimestamp: data.lastSyncTimestamp, version: data.version, listings: decodeIndex(data) };
    }
  } catch { /* fall through to the demo file */ }
  const res = await fetch("data/listings.json");
  if (!res.ok) throw new Error(`Could not load listings (${res.status})`);
  const data = await res.json();
  return { mode: "demo", lastSyncTimestamp: data.generated, version: 0, listings: data.listings };
}

/** Backwards-compatible: just the listings array. */
export async function loadListings() { return (await loadFeed()).listings; }

/** Full listing (all photos, remarks, office contact). Returns null if it's no longer active. */
export async function loadListingDetail(key) {
  const res = await fetch(`/api/idx/listing/${encodeURIComponent(key)}`, { cache: "no-cache" });
  if (res.status === 410) return { gone: true };
  if (!res.ok) throw new Error(`Listing details unavailable (${res.status})`);
  return res.json();
}

/** Public parcel records for an MLS listing: { status, parcel }. */
export async function loadParcel(key) {
  const res = await fetch(`/api/idx/parcel/${encodeURIComponent(key)}`);
  if (!res.ok) return { status: "error", parcel: null };
  return res.json();
}

/** Feed status: { mode, lastSyncTimestamp, version, activeListings, ... } or null. */
export async function getSyncStatus() {
  try {
    const res = await fetch("/api/idx/sync-status", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/**
 * Public records for any home in Broward, Palm Beach or St. Lucie by address.
 * Returns { status: "matched", property } | { status: "choose_unit", units } | { status, message }.
 * parcelKey ("P-<county#>-<parcel id>") picks a unit from a previous "choose_unit" answer.
 */
export async function lookupProperty(address, parcelKey = "") {
  const q = new URLSearchParams({ address });
  if (parcelKey) q.set("parcel", parcelKey);
  try {
    const res = await fetch(`/api/property/lookup?${q}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return { status: "error", message: "Home lookup needs the site's API (npm run dev locally, or the deployed Netlify site)." };
    return await res.json();
  } catch {
    return { status: "error", message: "Lookup is temporarily unavailable. Please try again." };
  }
}
