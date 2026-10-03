// Helpers for the route handlers under app/api/me. Each handler reads or writes for the session user only.
import { NextResponse } from "next/server";
import { AgentConfigError, agentFetch } from "@/lib/agent";
import { getSessionUser, type SessionUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function jsonError(error: string, status: number): Response {
  return NextResponse.json({ error }, { status });
}

/** Runs the handler for the signed-in user. Gives 401 without a session and 500 on a thrown error. */
export async function withUser(fn: (user: SessionUser) => Promise<Response>): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return jsonError("Not signed in.", 401);
  try {
    return await fn(user);
  } catch (err) {
    console.error("me route failed", err);
    return jsonError("Data is unavailable. Try again.", 500);
  }
}

/** Forwards a call to the agent with the session user id as the user_id query value. */
export async function forwardToAgent(
  user: SessionUser,
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await agentFetch(`${path}?user_id=${encodeURIComponent(user.id)}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, user_id: user.id }),
    });
  } catch (err) {
    if (err instanceof AgentConfigError) return jsonError("Agent is not configured.", 503);
    return jsonError("Agent is unreachable.", 502);
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

/** Reads a JSON object body. Returns null when the body is not an object. */
export async function readObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
