// Site owner only (ADMIN_EMAILS). Private tour requests (lib/leads.mjs).
// GET  /api/admin/leads                       — list (index rows) + settings + statuses
// GET  /api/admin/leads?id=<id>               — one request with its standard reply and referral text
// POST /api/admin/leads { id, status?, notes? }        — update
// POST /api/admin/leads { id, action: "ai-draft" }     — AI-written reply (contact details removed first)
// POST /api/admin/leads { id, action: "delete" }
// POST /api/admin/leads { action: "settings", myCounties: [...] }
import { sessionUser, sameOrigin, json } from "../lib/auth.mjs";
import { isAdmin } from "../lib/moderation.mjs";
import { STATUSES, listLeads, getLead, updateLead, deleteLead, getLeadSettings, saveLeadSettings,
  templateReply, referralSummary, aiReply, aiDraftEnabled } from "../lib/leads.mjs";
import { SITE } from "../../js/config.js";

const agent = () => ({ name: SITE.agentName, brokerage: SITE.brokerage, phone: SITE.phone });

export default async (req) => {
  const user = await sessionUser(req);
  if (!isAdmin(user)) return json({ error: "Not allowed" }, { status: 403 });
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const lead = await getLead(id);
      if (!lead) return json({ error: "Not found" }, { status: 404 });
      return json({ lead, reply: templateReply(lead, lead.listing, agent()), referral: referralSummary(lead, lead.listing), aiDrafts: aiDraftEnabled() });
    }
    return json({ leads: await listLeads(), settings: await getLeadSettings(), statuses: STATUSES });
  }
  if (req.method !== "POST" || !sameOrigin(req)) return json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "settings") return json(await saveLeadSettings(body));
  if (body.action === "delete") return (await deleteLead(body.id)) ? json({ ok: true }) : json({ error: "Not found" }, { status: 404 });
  if (body.action === "ai-draft") {
    const lead = await getLead(body.id);
    if (!lead) return json({ error: "Not found" }, { status: 404 });
    try { return json({ body: await aiReply(lead, lead.listing, agent()) }); }
    catch (e) { return json({ error: e.message }, { status: 503 }); }
  }
  const lead = await updateLead(body.id, { status: body.status, notes: body.notes }, user);
  return lead ? json({ ok: true, status: lead.status }) : json({ error: "Bad request" }, { status: 400 });
};

export const config = { path: "/api/admin/leads" };
