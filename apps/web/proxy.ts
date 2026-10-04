import { auth } from "@/lib/auth/server";

// Next 16 calls this file "proxy". Next 15 calls it "middleware".
export default auth.middleware({ loginUrl: "/auth/sign-in" });

// Matcher values must be constants. Keep this list equal to the (app) route group.
export const config = {
  matcher: [
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/conversations/:path*",
    "/calendar/:path*",
    "/twin/:path*",
    "/trends/:path*",
    "/share/:path*",
    "/goals/:path*",
    "/alerts/:path*",
    "/settings/:path*",
    "/demo/:path*",
  ],
};
