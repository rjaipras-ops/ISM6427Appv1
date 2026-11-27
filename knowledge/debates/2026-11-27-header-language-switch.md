# Header language switch: "English | Español" on phones (Nov 27, 2026)

**Owner's request:** show "English | Español" instead of "EN | ES".
**Decision:** option B+ (orchestrator; both reviewers accepted in round 2). Owner sign-off pending on the
icon-only logo on phones and EN | ES at 320px.

## Options (renders and measurements were the evidence)
- A: full words, "iToured" wordmark kept on phones. At 390px "LoKation Real Estate" got 30 of the 57px it needs (cut off, 3 lines).
- B: full words; phones show the logo icon only; 320px phones fall back to EN | ES.
- C: full words on desktop, EN | ES on phones, wordmark kept.
- D (ui-designer): switch on its own full-width row under the header on phones, wordmark kept. Header 56 -> 97px; the header is sticky, so the pinned area grows from about 160px to 200px of an 844px phone.
- B+ (ux-designer, round 2): B with 32px-tall switch buttons. Header stays 56px; buttons 53x32 / 56x32 (28x32 / 26x32 at 320px).

## Round 1
- **ux-designer** proposed B: it's what the owner asked, buyers are mostly on phones, "Español" is easier to spot than "ES"; A cuts off the brokerage. Accepted a weaker brand on phones.
- **idx-compliance-expert** (independent): PASS on BeachesMLS 20.2.5 (brokerage visible); no IDX rule requires the wordmark. REQUIRED: Spanish and signed-in screenshots at 360/320px.
- **ui-designer** (independent): accept with changes. Losing the wordmark at 390px (most common width) costs brand; switch buttons about 22px tall fail WCAG 2.5.8 (24px); header crowded. Counter-proposal D.

## Round 2
- **ux-designer**: accepted compliance's check (renders passed; Spanish sign-in "Entrar" is shorter). Accepted the tap-size point and proposed B+ instead of a new row. Rebutted D: 40px more pinned on every scroll for a control most buyers tap once.
- **idx-compliance-expert**: B+ PASS; D PASS.
- **ui-designer**: ACCEPT B+; the owner should confirm the icon-only logo at 390px.

## Decision (orchestrator)
Adopt B+; reject D. No tie-break needed (MLS > security > usability > looks would support it).
Follow-ups done: 32px buttons; header check `scripts/qa/header-check.cjs` (12 combinations pass);
`knowledge/ui-designer/style.md` breakpoints updated.
