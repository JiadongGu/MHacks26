import type { NextRequest } from "next/server";
import { forwardToAgent, isUuid, jsonError, readObject, withUser } from "@/lib/me-route";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// A goal id is a uuid, so the /api/agent proxy would answer 403. This route calls the agent itself.
// It passes only the fields the agent accepts. The agent scopes the update by user_id.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError("Bad goal id.", 400);
    const body = await readObject(req);
    if (!body) return jsonError("Body must be a JSON object.", 400);
    const patch: Record<string, unknown> = {};
    for (const key of ["target", "period", "direction", "active"] as const) {
      if (key in body) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) return jsonError("Send at least one field.", 400);
    return forwardToAgent(user, `/goals/${id}`, "PATCH", patch);
  });
}
