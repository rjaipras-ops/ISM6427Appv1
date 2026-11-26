# Security checklist

- No secrets in code, commits, Action logs or chat. Keys live in Netlify environment variables or
  GitHub Actions secrets, marked secret.
- The repository and GitHub Action logs are PUBLIC: logs print counts only; no addresses, owner
  names, lead details or private signals.
- The site publishes the repo root: private folders get 404 redirects in `netlify.toml`
  (/netlify, /scripts, /data, /tests, /docs, /.claude, /knowledge, CLAUDE.md, package files).
- Admin endpoints check `isAdmin` (ADMIN_EMAILS); POSTs check same origin.
- Upload endpoint: constant-time secret check, size limits, validated shape.
- Every paid or rate-limited API has a cap and a cache; no endpoint accepts arbitrary inputs that
  would spend money (solar is by listing key only).
- Never log a URL that contains a key.
- Owner names and lead contact details are never sent to AI services; strip them first.
- Leads: `submission-created` is a Netlify event function; Netlify signs the event and checks it
  before running, so outside requests can't add leads. Leads are read only through
  `/api/admin/leads` (isAdmin). Logs say "stored a request", never who.
- Lead AI drafts: only on the owner's click; `aiPrompt()` strips name, email, phone and links
  (tests/leads.test.mjs checks this). Daily cap LEAD_AI_DAILY_CAP (default 50).
