# Netlify notes

- Personal plan, 1,000 credits a month; each production deploy 15 credits.
- Save with `[skip netlify]` in the commit message; Netlify skips the build (0 credits).
- Environment variable changes need a deploy to take effect.
- Keys (names only): SPARK_API_BEARER_TOKEN, GEMINI_API_KEY, ADMIN_EMAILS, RECORDS_UPLOAD_SECRET,
  ORS_API_KEY, GOOGLE_SOLAR_API_KEY, GROQ_API_KEY (planned).
- Rollback: Deploys, last good deploy, Publish deploy, Lock to stop auto publishing (0 credits).
