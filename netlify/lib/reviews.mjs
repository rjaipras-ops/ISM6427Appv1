// Tour reviews, stored server-side (Netlify Blobs; local files in development).
// Only signed-in users can post; validation mirrors js/store.js validateReview().

import { randomUUID } from "node:crypto";
import { getJSON, setJSON } from "./store.mjs";

const KEY = "reviews/all";
const TOUR_TYPES = new Set(["open_house", "private_showing", "builder_tour"]);
const RATING_KEYS = ["overall", "condition", "matchesListing", "layout", "neighborhood", "noise"];
const MAX_PER_DAY = 10;

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

export async function allReviews() { return (await getJSON(KEY)) || []; }
async function save(rows) { await setJSON(KEY, rows); }

/** Public view (drops the list of who voted "helpful"). */
export const publicReview = ({ helpfulBy, ...r }) => r;

export async function createReview(input, user) {
  const errors = [];
  const listingId = clip(input.listingId, 80);
  const address = clip(input.address, 200);
  if (!listingId) errors.push("Missing home.");
  if (input.certified !== true) errors.push("You must certify that you toured this home in person.");
  if (!TOUR_TYPES.has(input.tourType)) errors.push("Choose how you toured the home.");
  const today = new Date().toISOString().slice(0, 10);
  const tourDate = clip(input.tourDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tourDate)) errors.push("Enter the date you toured the home.");
  else if (tourDate > today) errors.push("Tour date can't be in the future.");
  else if (new Date(tourDate) < new Date(Date.now() - 365 * 864e5)) errors.push("Tours must be within the last 12 months.");
  const ratings = {};
  for (const k of RATING_KEYS) {
    const v = Number(input.ratings?.[k]);
    if (Number.isInteger(v) && v >= 1 && v <= 5) ratings[k] = v;
  }
  if (!ratings.overall) errors.push("Give an overall rating.");
  const title = clip(input.title, 120);
  const body = clip(input.body, 5000);
  if (title.length < 4) errors.push("Add a short headline.");
  if (body.length < 30) errors.push("Write at least 30 characters about the tour.");

  const rows = await allReviews();
  if (rows.some((r) => r.listingId === listingId && r.userId === user.id)) errors.push("You've already reviewed this home.");
  const dayAgo = Date.now() - 864e5;
  if (rows.filter((r) => r.userId === user.id && Date.parse(r.createdAt) > dayAgo).length >= MAX_PER_DAY) errors.push("You've posted a lot of reviews today. Please try again tomorrow.");
  if (errors.length) return { errors };

  const now = new Date().toISOString();
  const review = {
    id: randomUUID(),
    listingId,
    address: address || null,
    userId: user.id,
    displayName: user.displayName,
    createdAt: now,
    tour: { date: tourDate, type: input.tourType },
    certification: {
      certified: true, method: "self", certifiedAt: now,
      statement: `I certify that I personally toured ${address || "this home"} on ${tourDate}.`,
    },
    ratings,
    title, body,
    pros: clip(input.pros, 500),
    cons: clip(input.cons, 500),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 12).map((t) => clip(t, 40)).filter(Boolean) : [],
    helpful: 0,
  };
  rows.push(review);
  await save(rows);
  return { review };
}

export async function deleteReview(id, user) {
  const rows = await allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r || r.userId !== user.id) return false;
  await save(rows.filter((x) => x.id !== id));
  return true;
}

/** One "helpful" vote per signed-in user; returns the new count, or null if not found. */
export async function markHelpful(id, user) {
  const rows = await allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r) return null;
  r.helpfulBy ||= [];
  if (r.helpfulBy.includes(user.id) || r.userId === user.id) return r.helpful || 0;
  r.helpfulBy.push(user.id);
  r.helpful = (r.helpful || 0) + 1;
  await save(rows);
  return r.helpful;
}
