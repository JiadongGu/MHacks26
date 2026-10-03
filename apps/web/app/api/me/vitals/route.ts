import { NextResponse, type NextRequest } from "next/server";
import { AgentConfigError } from "@/lib/agent";
import { jsonError, withUser } from "@/lib/me-route";
import { VitalsError, getVitalsPanel } from "@/lib/vitals";
import { parseHours } from "@/lib/vitals-math";

export const dynamic = "force-dynamic";

/** Query: metric=heart_rate (the only metric) and hours=1..48. Reads for the session user only. */
export async function GET(req: NextRequest) {
  return withUser(async (user) => {
    const params = req.nextUrl.searchParams;
    if ((params.get("metric") ?? "heart_rate") !== "heart_rate") {
      return jsonError("Only heart_rate is supported.", 400);
    }
    try {
      const panel = await getVitalsPanel(user.id, parseHours(params.get("hours")));
      return NextResponse.json(panel);
    } catch (err) {
      if (err instanceof AgentConfigError) return jsonError("Agent is not configured.", 503);
      if (err instanceof VitalsError) {
        console.error("vitals route: agent error", err.status, err.message);
        return err.status === 503
          ? jsonError("Live vitals are unavailable. Retrying.", 503)
          : jsonError("Could not read vitals.", 502);
      }
      if (err instanceof TypeError) return jsonError("Agent is unreachable.", 502);
      throw err;
    }
  });
}
