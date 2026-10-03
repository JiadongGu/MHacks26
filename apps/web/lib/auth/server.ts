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
/**
 * The session check calls Neon Auth over the network. One failed call must not sign the user out
 * (that showed up as random 401s on polled routes), so a failure or empty result is retried once.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data: session, error } = (await auth.getSession()) as {
        data: { user?: SessionUser } | null;
        error?: { message?: string } | null;
      };
      if (session?.user) return session.user;
      if (error) console.warn("getSession error", error.message ?? error);
    } catch (err) {
      console.warn("getSession threw", err instanceof Error ? err.message : err);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}
