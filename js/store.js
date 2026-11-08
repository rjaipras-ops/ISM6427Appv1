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
  reviews: "toured.reviews",
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
  "Friendly neighbors", "Flood-zone concerns",
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
    listingId: "45095582", displayName: "Marisol P.", daysAgo: 6, tourType: "open_house", tourDaysAgo: 9,
    ratings: { overall: 5, condition: 5, matchesListing: 4, layout: 5, neighborhood: 5, noise: 3 },
    title: "Gorgeous kitchen, Cass St traffic is real",
    body: "The renovation is legit — solid-wood cabinets, new roof per the disclosure binder, and the back bedroom gets amazing afternoon light. You do hear Cass Street from the front rooms during rush hour.",
    pros: "Kitchen, light, walkable to Armature Works", cons: "Road noise in front bedroom",
    tags: ["Recently renovated", "Great natural light", "Busy street"],
  },
  {
    listingId: "45095582", displayName: "Devin K.", daysAgo: 3, tourType: "private_showing", tourDaysAgo: 4,
    ratings: { overall: 4, condition: 4, matchesListing: 4, layout: 4, neighborhood: 5, noise: 3 },
    title: "Photos are accurate, yard is smaller",
    body: "Wide-angle photos make the backyard look bigger than it is. Inside matched the listing well. Agent said the HVAC is 3 years old.",
    pros: "Move-in ready", cons: "Small yard, one-car garage",
    tags: ["Looks like the photos", "Parking is tight"],
  },
  {
    listingId: "44903711", displayName: "Andre W.", daysAgo: 12, tourType: "open_house", tourDaysAgo: 13,
    ratings: { overall: 4, condition: 3, matchesListing: 4, layout: 5, neighborhood: 5, noise: 5 },
    title: "Huge lot on a quiet Carrollwood street",
    body: "Big, quiet lot with mature oaks. Bathrooms are original and will need work. Layout flows great for entertaining.",
    pros: "Lot size, layout, quiet", cons: "Dated bathrooms",
    tags: ["Quiet street", "Great yard", "Needs updating"],
  },
  {
    listingId: "64635767", displayName: "Priya S.", daysAgo: 20, tourType: "private_showing", tourDaysAgo: 22,
    ratings: { overall: 3, condition: 3, matchesListing: 2, layout: 3, neighborhood: 4, noise: 3 },
    title: "Listing photos are generous",
    body: "Unit is fine but noticeably darker than the photos suggest — they were clearly brightened. Ask about the special assessment; the HOA mentioned one is coming for the roof.",
    pros: "Location near SoHo", cons: "Darker than photos, possible special assessment",
    tags: ["Smaller than expected"],
  },
  {
    listingId: "45093980", displayName: "Tom R.", daysAgo: 2, tourType: "open_house", tourDaysAgo: 2,
    ratings: { overall: 5, condition: 4, matchesListing: 5, layout: 4, neighborhood: 4, noise: 4 },
    title: "Classic Seminole Heights bungalow",
    body: "Original heart-pine floors and a deep front porch. Exactly like the photos. Kitchen is small but functional.",
    pros: "Character, porch, location", cons: "Small kitchen",
    tags: ["Looks like the photos", "Friendly neighbors"],
  },
  {
    listingId: "44905441", displayName: "Jasmine L.", daysAgo: 30, tourType: "open_house", tourDaysAgo: 31,
    ratings: { overall: 2, condition: 2, matchesListing: 3, layout: 3, neighborhood: 3, noise: 4 },
    title: "Musty smell, check for water intrusion",
    body: "Strong musty odor in the back bedroom and staining on the ceiling near the AC closet. Might be fine after inspection, but go in with eyes open.",
    pros: "Quiet street, lake access", cons: "Odor, possible leak",
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
    userId: user.id,
    displayName: user.displayName,
    createdAt: now,
    tour: { date: input.tourDate, type: input.tourType },
    certification: {
      certified: true,
      method: "self", // later: "agent_confirmed" | "showing_service" (ShowingTime) | "geo_checkin"
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
// Swap this for your MLS/IDX API (e.g. a Netlify Function that calls a RESO Web API).
export async function loadListings() {
  const res = await fetch("data/listings.json");
  if (!res.ok) throw new Error(`Could not load listings (${res.status})`);
  const data = await res.json();
  return data.listings;
}
