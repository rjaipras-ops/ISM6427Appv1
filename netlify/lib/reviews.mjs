// Tour reviews, stored server-side (Netlify Blobs; local files in development).
// Only signed-in users can post; validation mirrors js/store.js validateReview().
//
// Moderation (see moderation.mjs):
//  status "published" — visible to everyone
//  status "pending"   — held for the site owner's approval (screening hit, or approve-all mode)
//  status "hidden"    — removed by the owner, or auto-hidden after enough reports
// Reviewers always see their own reviews, with a note when they're pending or hidden.

import { randomUUID } from "node:crypto";
import { getJSON, setJSON } from "./store.mjs";
import { getSettings, screen } from "./moderation.mjs";

const KEY = "reviews/all";
const TOUR_TYPES = new Set(["open_house", "private_showing", "builder_tour"]);
const RATING_KEYS = ["overall", "condition", "matchesListing", "layout", "neighborhood", "noise"];
const MAX_PER_DAY = 10;

// "What the photos don't show" prompts (keep in sync with js/store.js OBSERVATIONS / POSITIVES).
export const OBSERVATION_KEYS = ["water", "noise", "upkeep", "layout"];
export const OBSERVATION_LEVELS = new Set(["none", "some", "significant"]);
export const POSITIVES = ["Better natural light", "Quieter than expected", "Bigger than it looks", "Better views",
  "Better condition than the photos", "Nicer neighborhood than expected"];

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

export async function allReviews() { return (await getJSON(KEY)) || []; }
async function save(rows) { await setJSON(KEY, rows); }
export const statusOf = (r) => r.status || "published";

/** Public view: no voter/reporter lists or moderation notes. */
export const publicReview = ({ helpfulBy, reports, flags, moderation, ...r }) => ({ ...r, status: statusOf(r) });

/** What a visitor may see: published reviews, plus their own in any state. */
export function visibleTo(rows, user) {
  return rows.filter((r) => statusOf(r) === "published" || (user && r.userId === user.id));
}

function cleanObservations(input) {
  const out = {};
  for (const k of OBSERVATION_KEYS) {
    const o = input?.[k];
    if (!o || !OBSERVATION_LEVELS.has(o.level)) continue;
    out[k] = { level: o.level, note: o.level === "none" ? "" : clip(o.note, 160) };
  }
  return out;
}

export async function createReview(input, user) {
  const errors = [];
  const settings = await getSettings();
  const listingId = clip(input.listingId, 80);
  const address = clip(input.address, 200);
  if (!listingId) errors.push("Missing home.");
  if (settings.reviewsDisabled.includes(listingId) || (input.mlsNumber && settings.reviewsDisabled.includes(clip(input.mlsNumber, 40)))) {
    errors.push("Reviews are turned off for this home at the seller's request.");
  }
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

  const observations = cleanObservations(input.observations);
  const positives = Array.isArray(input.positives) ? input.positives.filter((p) => POSITIVES.includes(p)) : [];
  const fields = {
    title, body, pros: clip(input.pros, 500), cons: clip(input.cons, 500),
    positivesNote: clip(input.positivesNote, 160),
    ...Object.fromEntries(Object.entries(observations).map(([k, o]) => [`obs_${k}`, o.note])),
  };
  const flags = screen(fields);
  const status = flags.length || settings.approveAll ? "pending" : "published";

  const now = new Date().toISOString();
  const review = {
    id: randomUUID(),
    listingId,
    address: address || null,
    userId: user.id,
    displayName: user.displayName,
    createdAt: now,
    status,
    flags,
    tour: { date: tourDate, type: input.tourType },
    certification: {
      certified: true, method: "self", certifiedAt: now,
      statement: `I certify that I personally toured ${address || "this home"} on ${tourDate}.`,
    },
    ratings,
    title, body,
    pros: fields.pros,
    cons: fields.cons,
    observations,
    positives,
    positivesNote: fields.positivesNote,
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 12).map((t) => clip(t, 40)).filter(Boolean) : [],
    helpful: 0,
  };
  rows.push(review);
  await save(rows);
  return { review, held: status === "pending", heldReasons: flags.length ? flags : settings.approveAll ? ["All new reviews are checked before they're published"] : [] };
}

export async function deleteReview(id, user, { admin = false } = {}) {
  const rows = await allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r || (!admin && r.userId !== user.id)) return false;
  await save(rows.filter((x) => x.id !== id));
  return true;
}

/** One "helpful" vote per signed-in user; returns the new count, or null if not found. */
export async function markHelpful(id, user) {
  const rows = await allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r || statusOf(r) !== "published") return null;
  r.helpfulBy ||= [];
  if (r.helpfulBy.includes(user.id) || r.userId === user.id) return r.helpful || 0;
  r.helpfulBy.push(user.id);
  r.helpful = (r.helpful || 0) + 1;
  await save(rows);
  return r.helpful;
}

export const REPORT_REASONS = {
  not_toured: "Reviewer probably didn't tour this home",
  personal_info: "Contains personal information",
  discriminatory: "Discriminatory or fair-housing concern",
  offensive: "Offensive or harassing",
  spam: "Spam or advertising",
  inaccurate: "False or misleading",
  other: "Other",
};

/** Report a review (one report per user). Auto-hides at the report threshold. */
export async function reportReview(id, user, reason, note) {
  if (!REPORT_REASONS[reason]) return { error: "Choose a reason." };
  const rows = await allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r) return { error: "Not found", status: 404 };
  if (r.userId === user.id) return { error: "You can delete your own review instead." };
  r.reports ||= [];
  if (r.reports.some((x) => x.userId === user.id)) return { ok: true, already: true };
  r.reports.push({ userId: user.id, reason, note: clip(note, 300), at: new Date().toISOString() });
  const { reportThreshold } = await getSettings();
  if (statusOf(r) === "published" && r.reports.length >= reportThreshold) {
    r.status = "hidden";
    r.moderation = { action: "auto-hidden", reason: `${r.reports.length} reports`, at: new Date().toISOString() };
  }
  await save(rows);
  return { ok: true };
}

/** Owner actions: approve (publish), hide, restore. */
export async function moderate(id, action, admin) {
  const rows = await allReviews();
  const r = rows.find((x) => x.id === id);
  if (!r) return null;
  if (action === "approve" || action === "restore") { r.status = "published"; if (action === "approve") r.reports = []; }
  else if (action === "hide") r.status = "hidden";
  else return null;
  r.moderation = { action, by: admin.email, at: new Date().toISOString() };
  await save(rows);
  return r;
}
