// GET  /api/reviews  — published reviews (+ the signed-in user's own), and homes with reviews turned off
// POST /api/reviews  — create a review (must be signed in); may be held for approval
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { allReviews, createReview, publicReview, visibleTo } from "../lib/reviews.mjs";
import { getSettings } from "../lib/moderation.mjs";

export default async (req) => {
  if (req.method === "GET") {
    const [user, rows, settings] = await Promise.all([sessionUser(req), allReviews(), getSettings()]);
    return json({ reviews: visibleTo(rows, user).map(publicReview), reviewsDisabled: settings.reviewsDisabled });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const user = await sessionUser(req);
  if (!user) return json({ error: "Sign in to post a review." }, { status: 401 });
  const input = await req.json().catch(() => null);
  if (!input) return json({ error: "Bad request" }, { status: 400 });
  const r = await createReview(input, user);
  if (r.errors) return json({ error: r.errors[0], errors: r.errors }, { status: 422 });
  return json({ review: publicReview(r.review), held: r.held, heldReasons: r.heldReasons }, { status: 201 });
};

export const config = { path: "/api/reviews" };
