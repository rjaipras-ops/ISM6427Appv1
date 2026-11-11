// Listing photo carousel (in the listing page gallery) and full-screen viewer.
// Photos come from the MLS feed: [{ url, medium, thumb, caption }].
// Styling reuses the site's existing tokens (see "Photo carousel & viewer" in css/styles.css).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Carousel markup. `photos` may be just the primary photo while the full set loads. */
export function carouselHTML(photos, { address = "", fallback = "", loading = false } = {}) {
  if (!photos.length) {
    return `<div class="carousel carousel-empty">
      <div class="carousel-fallback">${fallback}</div>
      <span class="gal-label">${loading ? "Loading photos…" : "No photos provided by the listing broker"}</span>
    </div>`;
  }
  return `<div class="carousel" data-index="0" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Photos of ${esc(address)}">
    <div class="carousel-fallback" aria-hidden="true">${fallback}</div>
    <img class="carousel-img" src="${esc(photos[0].medium || photos[0].url)}" alt="${esc(photos[0].caption || `Photo 1 of ${address}`)}">
    ${photos.length > 1 ? `
      <button class="carousel-btn prev" type="button" aria-label="Previous photo">‹</button>
      <button class="carousel-btn next" type="button" aria-label="Next photo">›</button>` : ""}
    <button class="carousel-open" type="button" aria-label="View all photos full screen">
      <span class="carousel-count">1 / ${photos.length}</span>${photos.length > 1 ? " · View all" : " · Enlarge"}
    </button>
  </div>`;
}

/** Wires a rendered carousel. onOpen(index) opens the full-screen viewer. */
export function initCarousel(root, photos, { address = "", onOpen } = {}) {
  const el = root.querySelector(".carousel:not(.carousel-empty)");
  if (!el) return;
  const img = el.querySelector(".carousel-img");
  const count = el.querySelector(".carousel-count");
  let i = 0;
  retryOnce(img, () => el.classList.add("img-failed"));
  const show = (n) => {
    i = (n + photos.length) % photos.length;
    el.classList.remove("img-failed");
    delete img.dataset.retried;
    img.src = photos[i].medium || photos[i].url;
    img.alt = photos[i].caption || `Photo ${i + 1} of ${address}`;
    count.textContent = `${i + 1} / ${photos.length}`;
    el.dataset.index = i;
    // Warm the next photo.
    const nx = photos[(i + 1) % photos.length];
    if (nx) { const pre = new Image(); pre.src = nx.medium || nx.url; }
  };
  el.querySelector(".prev")?.addEventListener("click", (e) => { e.stopPropagation(); show(i - 1); });
  el.querySelector(".next")?.addEventListener("click", (e) => { e.stopPropagation(); show(i + 1); });
  el.querySelector(".carousel-open").addEventListener("click", () => onOpen?.(i));
  img.addEventListener("click", () => onOpen?.(i));
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(i - 1);
    else if (e.key === "ArrowRight") show(i + 1);
    else if (e.key === "Enter") onOpen?.(i);
  });
  swipe(el, () => show(i + 1), () => show(i - 1));
}

// Retry a photo once (slow or interrupted loads) before showing the fallback.
function retryOnce(img, onFail) {
  img.addEventListener("error", () => {
    if (!img.dataset.retried) {
      img.dataset.retried = "1";
      const src = img.src;
      setTimeout(() => { if (img.src === src) { img.removeAttribute("src"); img.src = src; } }, 600);
    } else onFail();
  });
}

function swipe(el, onLeft, onRight) {
  let x0 = null;
  el.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") x0 = e.clientX; });
  el.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) (dx < 0 ? onLeft : onRight)();
  });
}

/**
 * Full-screen viewer in the <dialog id="photoModal">.
 * `compliance` is HTML shown under every photo (listing firm, MLS #, last updated, logo, disclaimer).
 */
export function openLightbox(photos, start = 0, { address = "", compliance = "" } = {}) {
  const dlg = document.getElementById("photoModal");
  if (!dlg || !photos.length) return;
  let i = start;
  dlg.innerHTML = `
    <div class="lb">
      <header class="lb-head">
        <div class="lb-title">${esc(address)}</div>
        <span class="lb-count" aria-live="polite"></span>
        <button class="iconbtn lb-close" type="button" aria-label="Close photos">✕</button>
      </header>
      <div class="lb-stage">
        <button class="lb-btn prev" type="button" aria-label="Previous photo">‹</button>
        <figure class="lb-figure">
          <img class="lb-img" alt="">
          <figcaption class="lb-caption"></figcaption>
        </figure>
        <button class="lb-btn next" type="button" aria-label="Next photo">›</button>
      </div>
      <div class="lb-thumbs" role="listbox" aria-label="All photos">${photos.map((p, n) =>
        `<button type="button" class="lb-thumb" role="option" data-n="${n}" aria-label="Photo ${n + 1}"><img src="${esc(p.thumb || p.medium || p.url)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('thumb-failed')"></button>`).join("")}</div>
      <footer class="lb-foot">${compliance}</footer>
    </div>`;
  const img = dlg.querySelector(".lb-img");
  const cap = dlg.querySelector(".lb-caption");
  const cnt = dlg.querySelector(".lb-count");
  const show = (n) => {
    i = (n + photos.length) % photos.length;
    dlg.querySelector(".lb-figure").classList.remove("img-failed");
    delete img.dataset.retried;
    img.src = photos[i].url;
    img.alt = photos[i].caption || `Photo ${i + 1} of ${address}`;
    cap.textContent = photos[i].caption || "";
    cnt.textContent = `${i + 1} / ${photos.length}`;
    dlg.querySelectorAll(".lb-thumb").forEach((t, n) => t.setAttribute("aria-selected", String(n === i)));
    dlg.querySelector(`.lb-thumb[data-n="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  retryOnce(img, () => dlg.querySelector(".lb-figure").classList.add("img-failed"));
  dlg.querySelector(".prev").onclick = () => show(i - 1);
  dlg.querySelector(".next").onclick = () => show(i + 1);
  dlg.querySelector(".lb-close").onclick = () => dlg.close();
  dlg.querySelector(".lb-thumbs").onclick = (e) => { const t = e.target.closest(".lb-thumb"); if (t) show(Number(t.dataset.n)); };
  dlg.onkeydown = (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); show(i + 1); }
  };
  swipe(dlg.querySelector(".lb-stage"), () => show(i + 1), () => show(i - 1));
  show(i);
  dlg.showModal();
  dlg.querySelector(".lb-close").focus();
}
