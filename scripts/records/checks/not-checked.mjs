import { result } from "./util.mjs";

/** Beds, baths and pool: reported as not checked until an allowed public source provides them. */
export function notChecked(l, _r, rules) {
  const out = [];
  const show = (v) => (v == null ? null : v === true ? "yes" : v === false ? "no" : v);
  for (const [key, label, value] of [["beds", "Bedrooms", l.beds], ["baths", "Bathrooms", l.baths], ["pool", "Private pool", l.pool]]) {
    const cfg = rules[key];
    if (!cfg?.enabled) out.push(result(label, "not_checked", show(value), null, cfg?.reason || "No source."));
  }
  return out;
}
