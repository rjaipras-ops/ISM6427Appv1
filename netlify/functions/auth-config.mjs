// GET /api/auth/config — what the sign-in dialog should offer. The Google client ID is public.
import { googleClientId, devLoginEnabled, json } from "../lib/auth.mjs";

export default async () => json({ googleClientId: googleClientId() || null, devLogin: devLoginEnabled() });

export const config = { path: "/api/auth/config" };
