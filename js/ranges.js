// Range sliders for the search filters (price, monthly payment, home size, lot size, HOA).
//
// Each slider snaps to a list of friendly steps. Two-thumb sliders set a min and a max; the far
// left means "no min" and the far right "no max". Price and payment also keep a text box you can
// type into ("450k", "$1.2M"); the slider follows whatever is typed.

const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
const short = (v) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(v % 1e6 ? 2 : 0)}M` : `$${Math.round(v / 1e3)}K`);
const span = (from, to, step) => { const a = []; for (let v = from; v <= to; v += step) a.push(v); return a; };

export const RANGES = {
  price: {
    lo: "priceMin", hi: "priceMax", input: true,
    steps: [0, ...span(25e3, 1e6, 25e3), ...span(1.1e6, 3e6, 1e5), ...span(3.5e6, 10e6, 5e5), 12.5e6, 15e6, 20e6],
    label: short, inputFmt: money, noMin: "No min", noMax: "No max",
  },
  pay: {
    hi: "payMax", input: true,
    steps: [...span(1000, 6000, 250), ...span(6500, 10000, 500), 12500, 15000],
    label: (v) => `${money(v)}/mo`, inputFmt: money, noMax: "No max",
  },
  sqft: {
    lo: "sqftMin", hi: "sqftMax",
    steps: [0, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000, 3500, 4000, 5000, 6000, 7500, 10000],
    label: (v) => `${v.toLocaleString("en-US")} sqft`, noMin: "Any", noMax: "Any",
  },
  lot: {
    lo: "lotMin", hi: "lotMax",
    steps: [0, 2000, 3000, 4500, 6500, 8000, 10890, 16335, 21780, 32670, 43560, 87120, 217800],
    label: (v) => (v >= 10890 ? `${+(v / 43560).toFixed(2)} acre${v === 43560 ? "" : "s"}` : `${v.toLocaleString("en-US")} sqft`),
    noMin: "Any", noMax: "Any",
  },
  hoa: {
    hi: "hoaMax",
    steps: [0, 100, 200, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000],
    label: (v) => (v === 0 ? "No HOA" : `up to ${money(v)}/mo`), noMax: "Any",
  },
};

/** Fills every <div class="rng" data-rng="…"> placeholder. */
export function buildRanges() {
  for (const el of $$(".rng[data-rng]")) {
    const c = RANGES[el.dataset.rng];
    const n = c.steps.length; // hi position n = "no max"; lo position 0 = "no min"
    const thumb = (cls, max, label) => `<input type="range" class="${cls}" min="0" max="${max}" step="1" aria-label="${label}">`;
    el.innerHTML = `
      ${c.input ? "" : `<div class="rng-out" aria-live="polite"></div>`}
      <div class="rng-track${c.lo ? "" : " rng-single"}"><div class="rng-rail"></div><div class="rng-fill"></div>
        ${c.lo ? thumb("rng-lo", n, "Minimum") : ""}${thumb("rng-hi", n, "Maximum")}
      </div>
      ${c.input ? `<div class="range-row rng-inputs">
        ${c.lo ? `<input name="${c.lo}" class="money" inputmode="decimal" autocomplete="off" placeholder="${c.noMin}" aria-label="Minimum">` : ""}
        ${c.lo ? "<span>–</span>" : ""}
        <input name="${c.hi}" class="money" inputmode="decimal" autocomplete="off" placeholder="${c.noMax}" aria-label="Maximum">
        ${c.lo ? "" : `<span class="muted">${el.dataset.suffix || ""}</span>`}
      </div>` : ""}`;
  }
}

// Slider position <-> filter value.
const posOf = (c, v, isHi) => {
  if (v == null) return isHi ? c.steps.length : 0;
  let best = 0;
  c.steps.forEach((s, i) => { if (Math.abs(s - v) < Math.abs(c.steps[best] - v)) best = i; });
  return best;
};
const valOf = (c, pos, isHi) => (isHi ? (pos >= c.steps.length ? null : c.steps[pos]) : (pos <= 0 && c.steps[0] === 0 ? null : c.steps[pos]));

function paint(el, c, loPos, hiPos) {
  const n = c.steps.length;
  const fill = el.querySelector(".rng-fill");
  fill.style.left = `${((c.lo ? loPos : 0) / n) * 100}%`;
  fill.style.right = `${100 - (hiPos / n) * 100}%`;
  const out = el.querySelector(".rng-out");
  if (out) {
    const lo = c.lo ? valOf(c, loPos, false) : null, hi = valOf(c, hiPos, true);
    out.textContent = !c.lo ? (hi == null ? c.noMax : c.label(hi))
      : lo == null && hi == null ? "Any" : `${lo == null ? c.noMin : c.label(lo)} – ${hi == null ? c.noMax : c.label(hi)}`;
  }
}

/** Moves every slider to match the current filters (skips the one being dragged). */
export function syncRanges(f) {
  for (const el of $$(".rng[data-rng]")) {
    if (el.dataset.dragging) continue;
    const c = RANGES[el.dataset.rng];
    const loPos = c.lo ? posOf(c, f[c.lo], false) : 0;
    const hiPos = posOf(c, f[c.hi], true);
    const lo = el.querySelector(".rng-lo"), hi = el.querySelector(".rng-hi");
    if (lo) lo.value = loPos;
    hi.value = hiPos;
    paint(el, c, loPos, hiPos);
  }
}

/** Wires slider events. `apply(patch)` updates the filters (called when a thumb is released). */
export function wireRanges(apply) {
  const read = (el) => {
    const c = RANGES[el.dataset.rng];
    const lo = el.querySelector(".rng-lo"), hi = el.querySelector(".rng-hi");
    let loPos = lo ? Number(lo.value) : 0, hiPos = Number(hi.value);
    return { c, lo, hi, loPos, hiPos };
  };
  document.addEventListener("input", (e) => {
    if (e.target.type !== "range") return;
    const el = e.target.closest(".rng[data-rng]");
    if (!el) return;
    el.dataset.dragging = "1";
    const r = read(el);
    // Keep the thumbs from crossing.
    if (r.lo && r.loPos >= r.hiPos) {
      if (e.target === r.lo) { r.loPos = r.hiPos - 1; r.lo.value = r.loPos; } else { r.hiPos = r.loPos + 1; r.hi.value = r.hiPos; }
    }
    paint(el, r.c, r.loPos, r.hiPos);
    // Live-update the text boxes while dragging.
    if (r.c.input) {
      const lv = r.c.lo ? valOf(r.c, r.loPos, false) : null, hv = valOf(r.c, r.hiPos, true);
      if (r.c.lo) el.querySelector(`[name=${r.c.lo}]`).value = lv == null ? "" : r.c.inputFmt(lv);
      el.querySelector(`[name=${r.c.hi}]`).value = hv == null ? "" : r.c.inputFmt(hv);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.type !== "range") return;
    const el = e.target.closest(".rng[data-rng]");
    if (!el) return;
    e.stopPropagation();
    delete el.dataset.dragging;
    const r = read(el);
    const patch = { [r.c.hi]: valOf(r.c, r.hiPos, true) };
    if (r.c.lo) patch[r.c.lo] = valOf(r.c, r.loPos, false);
    apply(patch);
  }, true);
}
