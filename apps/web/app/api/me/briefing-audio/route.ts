// Streams the spoken morning briefing (audio/mpeg) of the session user.
// The agent makes the briefing and the audio if they do not exist yet, so the first call can take a few seconds.
import type { NextRequest } from "next/server";
import { AgentConfigError, agentFetch } from "@/lib/agent";
import { parseRange } from "@/lib/briefing";
import { getSessionUser } from "@/lib/auth/server";
import { jsonError } from "@/lib/me-route";

export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 60_000;
const BASE_HEADERS = {
  "Content-Type": "audio/mpeg",
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store",
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Not signed in.", 401);

  let upstream: Response;
  try {
    upstream = await agentFetch(`/voice/briefing?user_id=${encodeURIComponent(user.id)}`, {
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof AgentConfigError) return jsonError("Agent is not configured.", 503);
    return jsonError("Agent is unreachable.", 502);
  }

  if (!upstream.ok) {
    await upstream.body?.cancel();
    if (upstream.status === 404) return jsonError("No briefing yet.", 404);
    if (upstream.status === 503) return jsonError("Voice is unavailable.", 503);
    return jsonError("Agent could not make the audio.", 502);
  }

  // A briefing is under 200 KB, so the body is buffered. That lets the route answer Range requests,
  // which Safari sends before it plays audio.
  const audio = new Uint8Array(await upstream.arrayBuffer());
  const range = parseRange(req.headers.get("range"), audio.byteLength);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...BASE_HEADERS, "Content-Range": `bytes */${audio.byteLength}` },
    });
  }
  if (range) {
    const part = audio.slice(range.start, range.end + 1);
    return new Response(part, {
      status: 206,
      headers: {
        ...BASE_HEADERS,
        "Content-Length": String(part.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${audio.byteLength}`,
      },
    });
  }
  return new Response(audio, {
    status: 200,
    headers: { ...BASE_HEADERS, "Content-Length": String(audio.byteLength) },
  });
}
