# Orchestrator notes

## How a change flows
1. Plan: goal, visible changes, which specialists, which reviewers.
2. Build in waves: independent pieces first, then the screens on top.
3. Reviews (read-only): idx-compliance-expert and fair-housing-consumer-law-reviewer for anything
   visible; security-expert for keys, admin, uploads, Actions, logs.
4. qa-engineer: `npm test`, phone and desktop screenshots.
5. Save with `[skip netlify]` on `claude/admiring-hypatia-xexmgo` and `main`; add the change to the
   pending list in `CLAUDE.md`. A batch is about 10 site changes; deploy only on the owner's word.

## Owner decisions to remember
- Batches of about 10 site changes; screenshots before publishing (Nov 25, 2026).
- Ask, don't build, when an MLS or legal rule is unclear.
- Changes only under `scripts/records/` never need a Netlify deploy.
