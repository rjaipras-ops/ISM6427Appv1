# Outside services

| Service | Used for | Key (Netlify) | Limits and caps | Notes |
|---|---|---|---|---|
| FRED (St. Louis Fed) CSV, MORTGAGE30US | Payment estimates | none | weekly data; 6 h cache | Freddie Mac PMMS; show rate and week |
| USGS Elevation Point Query Service | Ground elevation | none | cached per location | 1 m lidar (3DEP) in South Florida |
| Open Topo Data (ned10m) | Elevation fallback | none | ~1,000/day public | |
| OpenRouteService | Commute search (geocode + isochrone) | ORS_API_KEY | free plan; COMMUTE_DAILY_CAP 400; 30-day cache | no live traffic; say so |
| Google Solar API (buildingInsights) | Rooftop solar on house listings | GOOGLE_SOLAR_API_KEY | SOLAR_MONTHLY_CAP 2,000; 30-day cache (Google's caching limit) | listing key only, no arbitrary points; never log the URL |
| Gemini API | AI search, agent drafts | GEMINI_API_KEY | AI_SEARCH_DAILY_LIMIT 800, 30 per visitor | free tier may use inputs: strip contact details first |
| Groq (planned backup) | AI search backup, drafts | GROQ_API_KEY | free plan (check current limits) | |
| Firecrawl | Research during development only | (developer account) | ~1 credit per page read | not used by the site |

Rules: server-side calls only, cache, cap, fallback, attribution, and the provider's terms.
