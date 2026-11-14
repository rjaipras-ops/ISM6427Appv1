// Review moderation: automatic screening, site settings, and who counts as an admin.
//
// Screening holds a review for approval (it is never silently rejected) when it contains:
//  - contact details or links (phone numbers, emails, URLs, social handles)
//  - profanity
//  - wording that can raise fair-housing concerns: comments about who lives in an area or
//    who the home suits (race, religion, national origin, familial status, disability…)
// The site owner then approves, edits out, or hides it from the admin page.

import { getJSON, setJSON } from "./store.mjs";

const SETTINGS_KEY = "reviews/settings";
const DEFAULT_SETTINGS = { approveAll: false, reviewsDisabled: [], reportThreshold: 3 };

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await getJSON(SETTINGS_KEY)) || {}) };
}
export async function saveSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  s.reviewsDisabled = [...new Set((s.reviewsDisabled || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 2000);
  s.approveAll = !!s.approveAll;
  s.reportThreshold = Math.min(10, Math.max(1, Number(s.reportThreshold) || 3));
  await setJSON(SETTINGS_KEY, s);
  return s;
}

/** Admins are the Google accounts listed in ADMIN_EMAILS (comma-separated, set in Netlify). */
export function isAdmin(user) {
  if (!user?.email) return false;
  const list = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(String(user.email).toLowerCase());
}

const PROFANITY = /\b(f+u+c+k+\w*|sh[i1]t+\w*|bitch\w*|bastard|asshole|dick(?:head)?|cunt|motherf\w*|whore|slut|retard\w*)\b/i;
const CONTACT = [
  [/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, "a phone number"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, "an email address"],
  [/\b(?:https?:\/\/|www\.)\S+|\b\w+\.(?:com|net|org|io|co)\b/i, "a link"],
  [/(^|\s)@\w{3,}/, "a social media handle"],
];
// Fair-housing: describing people (who lives there / who should live there), not the property.
const FAIR_HOUSING = [
  /\b(white|black|hispanic|latino|latina|asian|african[- ]american|caucasian|mexican|haitian|cuban|jewish|muslim|christian|catholic|hindu|arab|immigrants?|foreigners?)\s+(neighbo(u)?rs?|neighbo(u)?rhood|area|families|people|community|residents|tenants|owners)\b/i,
  /\b(neighbo(u)?rhood|area|community|building|street)\s+(is|was|seems|feels)\s+(mostly|all|very|too)\s+(white|black|hispanic|latino|asian|jewish|muslim|christian|ethnic|foreign)\b/i,
  /\b(ghetto|hood|bad element|those people|undesirables?|sketchy people|section 8 crowd)\b/i,
  /\b(no|not for|not good for|bad for|avoid if you have)\s+(kids|children|families|families with children)\b/i,
  /\b(perfect|ideal|great)\s+for\s+(a\s+)?(young\s+)?(christian|jewish|muslim|white|black|hispanic|single (man|woman)|couple without kids)\b/i,
  /\b(handicap(ped)?|wheelchair[- ]bound|crippled?|disabled people)\b/i,
];

/** Returns a list of reasons a review should be held for approval (empty = fine to publish). */
export function screen(fields) {
  const text = Object.values(fields).filter(Boolean).join("\n");
  const reasons = [];
  for (const [re, what] of CONTACT) if (re.test(text)) reasons.push(`Contains ${what}`);
  if (PROFANITY.test(text)) reasons.push("Contains profanity");
  if (FAIR_HOUSING.some((re) => re.test(text))) reasons.push("Possible fair-housing concern (describes people rather than the property)");
  return reasons;
}
