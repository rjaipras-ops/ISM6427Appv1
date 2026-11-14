// Site owner only (ADMIN_EMAILS).
// GET  /api/admin/reviews                      — every review with status, screening flags and reports
// POST /api/admin/reviews  { id, action }      — approve | hide | restore | delete
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { isAdmin } from "../lib/moderation.mjs";
import { allReviews, moderate, deleteReview, statusOf, REPORT_REASONS } from "../lib/reviews.mjs";
import { getJSON } from "../lib/store.mjs";

export default async (req) => {
  const user = await sessionUser(req);
  if (!isAdmin(user)) return json({ error: "Not allowed" }, { status: 403 });
  if (req.method === "GET") {
    const rows = await allReviews();
    const emails = {};
    await Promise.all([...new Set(rows.map((r) => r.userId))].map(async (id) => { emails[id] = (await getJSON(`users/${id}`))?.email || null; }));
    const out = rows.map(({ helpfulBy, ...r }) => ({
      ...r, status: statusOf(r), reviewerEmail: emails[r.userId] || null,
      reports: (r.reports || []).map((x) => ({ reason: REPORT_REASONS[x.reason] || x.reason, note: x.note, at: x.at })),
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ reviews: out });
  }
  if (req.method !== "POST" || !sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const { id, action } = await req.json().catch(() => ({}));
  if (action === "delete") return (await deleteReview(id, user, { admin: true })) ? json({ ok: true }) : json({ error: "Not found" }, { status: 404 });
  const r = await moderate(id, action, user);
  return r ? json({ ok: true, status: r.status }) : json({ error: "Not found" }, { status: 404 });
};

export const config = { path: "/api/admin/reviews" };
