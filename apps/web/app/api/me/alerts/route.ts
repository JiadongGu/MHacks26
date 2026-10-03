import { NextResponse, type NextRequest } from "next/server";
import { isUuid, jsonError, readObject, withUser } from "@/lib/me-route";
import { listAlerts, markAlertsRead } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const raw = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 20;
    return NextResponse.json({ alerts: await listAlerts(user.id, limit) });
  });
}

/** Body: {all: true} or {ids: string[]}. Marks alerts read for the session user. */
export async function POST(req: NextRequest) {
  return withUser(async (user) => {
    const body = await readObject(req);
    if (!body) return jsonError("Body must be a JSON object.", 400);
    if (body.all === true) {
      return NextResponse.json({ updated: await markAlertsRead(user.id, "all") });
    }
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids || ids.length === 0 || ids.length > 100) {
      return jsonError("Send ids (1 to 100) or all: true.", 400);
    }
    if (!ids.every((id): id is string => typeof id === "string" && isUuid(id))) {
      return jsonError("Every id must be a uuid.", 400);
    }
    return NextResponse.json({ updated: await markAlertsRead(user.id, ids) });
  });
}
