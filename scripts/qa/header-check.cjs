// Header check on phones (run with the dev server: IDX_SAMPLE_DATA=true AUTH_DEV_LOGIN=true npm run dev):
//   NODE_PATH=$(npm root -g) node scripts/qa/header-check.cjs
// For English and Spanish, signed out and in, at 390/360/320px: the brokerage name is not cut off
// (BeachesMLS 20.2.5), language buttons are at least 24px (WCAG 2.5.8), header stays 56px, no sideways scroll.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); let fails = 0;
  for (const signedIn of [false, true]) for (const es of [false, true]) for (const w of [390, 360, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 700 } }); const p = await ctx.newPage();
    await p.addInitScript(() => { try { localStorage.setItem("installDismissedAt", String(Date.now())); } catch {} });
    await p.goto("http://localhost:8888/" + (es ? "?lang=es" : "")); await p.waitForSelector(".card", { timeout: 20000 });
    if (signedIn) { await p.evaluate(() => fetch("/api/auth/dev", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Maria P", email: "maria@example.com" }) })); await p.reload(); await p.waitForSelector(".card"); }
    const m = await p.evaluate(() => { const f = document.querySelector(".broker-firm"), br = document.querySelector("#brokerage"); const btn = [...document.querySelectorAll(".lang-toggle button")].map((x) => x.getBoundingClientRect());
      return { cut: f.scrollWidth > br.clientWidth + 1, minH: Math.min(...btn.map((r) => r.height)), minW: Math.min(...btn.map((r) => r.width)), header: Math.round(document.querySelector(".topbar").getBoundingClientRect().height), overflow: document.documentElement.scrollWidth > innerWidth }; });
    const ok = !m.cut && m.minH >= 24 && m.minW >= 24 && m.header === 56 && !m.overflow; if (!ok) fails++;
    
    console.log(`${ok ? "ok  " : "FAIL"} ${signedIn ? "signed-in" : "signed-out"} ${es ? "ES" : "EN"} ${w}px`, JSON.stringify(m));
    await ctx.close();
  }
  console.log(fails ? `${fails} failed` : "all passed"); await b.close();
})();
