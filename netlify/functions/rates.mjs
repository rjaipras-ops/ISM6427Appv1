// GET /api/rates — this week's 30-year mortgage rate for the payment estimates (see lib/rates.mjs).
import { mortgageRate } from "../lib/rates.mjs";

export default async () => {
  const rate = await mortgageRate();
  return Response.json(rate, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      // The rate changes once a week: Netlify's CDN answers almost every request.
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
};

export const config = { path: "/api/rates" };
