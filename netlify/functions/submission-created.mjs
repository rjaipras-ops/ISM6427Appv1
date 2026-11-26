// Netlify calls this after each verified (non-spam) form submission. Netlify signs these events and
// checks the signature before running the function, so outside requests can't add fake leads.
// It keeps a private copy of tour requests for the owner's Leads tab (see lib/leads.mjs).
// Logs never include the person's details.
import { leadFromSubmission, listingSnapshot, saveLead } from "../lib/leads.mjs";
import { getListingDetail } from "../lib/detail.mjs";

export default async (req) => {
  try {
    const lead = leadFromSubmission(await req.json());
    if (!lead) return new Response("ignored");
    let listing = null;
    if (lead.listingKey) {
      const r = await getListingDetail(lead.listingKey).catch(() => null);
      listing = listingSnapshot(r?.listing);
    }
    await saveLead(lead, listing);
    console.log("[leads] stored a request", listing ? "for a listing" : "(general)");
  } catch (e) {
    console.warn("[leads] couldn't store a request:", e.message);
  }
  return new Response("ok");
};
