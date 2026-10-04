import { NextResponse, type NextRequest } from "next/server";
import { AgentConfigError, agentFetch } from "@/lib/agent";
import { parseExplain } from "@/lib/explain";
import { isUuid, jsonError, withUser } from "@/lib/me-route";
import { getAlertExplain } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const AGENT_TIMEOUT_MS = 8_000;

// An alert id is a uuid, so the /api/agent proxy would answer 403. This route reads the stored explain from
// Neon first. For an older alert it asks the agent to rebuild one. The agent scopes the read by user_id.
export async function GET(_req: NextRequest, ctx: Ctx) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError("Bad alert id.", 400);
    const stored = await getAlertExplain(user.id, id);
    if (!stored.found) return jsonError("Alert not found.", 404);
    if (stored.explain) return NextResponse.json({ explain: stored.explain });
    let upstream: Response;
    try {
      upstream = await agentFetch(`/alerts/${id}/explain?user_id=${encodeURIComponent(user.id)}`, {
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof AgentConfigError) return jsonError("Agent is not configured.", 503);
      return jsonError("Agent is unreachable.", 502);
    }
    if (!upstream.ok) {
      return jsonError("Could not build the explanation.", upstream.status === 404 ? 404 : 502);
    }
    const explain = parseExplain(await upstream.json().catch(() => null));
    if (!explain) return jsonError("The agent sent an explanation that Pulse cannot read.", 502);
    return NextResponse.json({ explain });
  });
}
