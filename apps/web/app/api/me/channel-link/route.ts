import { NextResponse, type NextRequest } from "next/server";
import { LINK_CODE_RE, isLinkChannel } from "@/lib/link-code";
import { jsonError, withUser } from "@/lib/me-route";
import { getChannelLinkStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET ?code=PULSE-XXXXXX&channel=imessage|asi_one gives {status} for the session user. */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const code = req.nextUrl.searchParams.get("code") ?? "";
    const channel = req.nextUrl.searchParams.get("channel") ?? "imessage";
    if (!LINK_CODE_RE.test(code)) return jsonError("Bad link code.", 400);
    if (!isLinkChannel(channel)) return jsonError("Bad channel.", 400);
    return NextResponse.json({ status: await getChannelLinkStatus(user.id, code, channel) });
  });
}
