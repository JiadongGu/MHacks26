import { NextResponse, type NextRequest } from "next/server";
import { isChannel } from "@/lib/conversations";
import { jsonError, withUser } from "@/lib/me-route";
import { listChannelMessages, listMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Without ?channel= it returns the newest messages of every channel (the demo log).
 * With ?channel=imessage|asi_one|web|relay it returns one thread, newest first, with `tools` on each message.
 */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const params = req.nextUrl.searchParams;
    const channel = params.get("channel");
    if (channel !== null) {
      if (!isChannel(channel)) return jsonError("Unknown channel.", 400);
      const raw = Number(params.get("limit") ?? 100);
      const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 100;
      return NextResponse.json({ messages: await listChannelMessages(user.id, channel, limit) });
    }
    const raw = Number(params.get("limit") ?? 10);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : 10;
    return NextResponse.json({ messages: await listMessages(user.id, limit) });
  });
}
