import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/lib/me-route";
import { listMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const raw = Number(req.nextUrl.searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : 10;
    return NextResponse.json({ messages: await listMessages(user.id, limit) });
  });
}
