import type { NextRequest } from "next/server";
import { forwardToAgent, isUuid, jsonError, readObject, withUser } from "@/lib/me-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// The /api/agent proxy rejects a uuid path segment that is not the session user id.
// A proposal id is a uuid, so this route calls the agent itself. The agent scopes the call by user_id.
export async function POST(req: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError("Bad proposal id.", 400);
    const body = await readObject(req);
    const decision = body?.decision;
    if (decision !== "approved" && decision !== "rejected") {
      return jsonError("decision must be approved or rejected.", 400);
    }
    return forwardToAgent(user, `/proposals/${id}/decide`, "POST", { decision, via: "web" });
  });
}
