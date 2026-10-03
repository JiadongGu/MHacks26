import { NextResponse, type NextRequest } from "next/server";
import { LINK_CODE_RE } from "@/lib/link-code";
import { jsonError, withUser } from "@/lib/me-route";
import { getChannelLinkStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET ?code=PULSE-XXXX gives {status: "pending" | "linked" | "missing"} for the session user. */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const code = req.nextUrl.searchParams.get("code") ?? "";
    if (!LINK_CODE_RE.test(code)) return jsonError("Bad link code.", 400);
    return NextResponse.json({ status: await getChannelLinkStatus(user.id, code) });
  });
}
