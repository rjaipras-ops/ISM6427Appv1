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
