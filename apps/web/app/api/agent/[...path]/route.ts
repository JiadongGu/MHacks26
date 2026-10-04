import { NextResponse, type NextRequest } from "next/server";
import { AgentConfigError, agentFetch } from "@/lib/agent";
import {
  buildAgentPath,
  withUserBody,
  withUserQuery,
} from "@/lib/agent-proxy";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

const PASS_HEADERS = ["content-type", "location", "cache-control"];

async function forward(req: NextRequest, ctx: Ctx): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { path } = await ctx.params;
  const checked = buildAgentPath(path, user.id);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: checked.status });
  }

  // The session user id replaces any user_id from the client.
  const isRead = req.method === "GET";
  const query = withUserQuery(req.nextUrl.searchParams, user.id).toString();
  const init: RequestInit = { method: req.method, redirect: "manual" };

  if (!isRead) {
    const body = withUserBody(await req.text(), user.id);
    if (body === null) {
      return NextResponse.json(
        { error: "Body must be a JSON object." },
        { status: 400 },
      );
    }
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }

  let upstream: Response;
  try {
    upstream = await agentFetch(`${checked.path}?${query}`, init);
  } catch (err) {
    const status = err instanceof AgentConfigError ? 503 : 502;
    const error =
      err instanceof AgentConfigError ? "Agent is not configured." : "Agent is unreachable.";
    return NextResponse.json({ error }, { status });
  }

  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
