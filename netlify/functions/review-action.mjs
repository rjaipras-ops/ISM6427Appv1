// POST /api/reviews/:id/delete   — delete your own review
// POST /api/reviews/:id/helpful  — mark a review helpful (one vote per user)
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { deleteReview, markHelpful } from "../lib/reviews.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, { status: 405 });
  if (!sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const user = await sessionUser(req);
  if (!user) return json({ error: "Sign in first." }, { status: 401 });
  const { id, action } = context.params || {};
  if (action === "delete") return (await deleteReview(id, user)) ? json({ ok: true }) : json({ error: "Not found" }, { status: 404 });
  if (action === "helpful") {
    const n = await markHelpful(id, user);
    return n == null ? json({ error: "Not found" }, { status: 404 }) : json({ helpful: n });
  }
  return json({ error: "Unknown action" }, { status: 404 });
};

export const config = { path: "/api/reviews/:id/:action" };
