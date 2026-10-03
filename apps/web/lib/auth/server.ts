import { createNeonAuth } from "@neondatabase/auth/next/server";

// createNeonAuth throws when the cookie secret is shorter than 32 characters.
// The build step has no env vars, so it gets placeholders.
// A running server with missing env vars still fails fast.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isDev = process.env.NODE_ENV !== "production";
const placeholder = isBuild || isDev;

export const auth = createNeonAuth({
  baseUrl:
    process.env.NEON_AUTH_BASE_URL ??
    (placeholder ? "http://localhost:0/neon-auth-not-configured" : ""),
  cookies: {
    secret:
      process.env.NEON_AUTH_COOKIE_SECRET ??
      (placeholder ? "development-only-cookie-secret-not-for-production" : ""),
  },
});

export type SessionUser = { id: string; email: string; name?: string | null };

/** Returns the signed-in user, or null. Returns null when auth is not configured. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const { data: session } = await auth.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}
