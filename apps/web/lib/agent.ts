// Server-only helper. Import it from Server Components and Route Handlers only.
// It reads INTERNAL_TOKEN, which must never reach the browser.

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

/** Calls the agent service and adds the X-Internal-Token header. */
export async function agentFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = process.env.AGENT_URL;
  const token = process.env.INTERNAL_TOKEN;
  if (!base || !token) {
    throw new AgentConfigError("AGENT_URL or INTERNAL_TOKEN is not set.");
  }
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Token", token);
  return fetch(url, { cache: "no-store", ...init, headers });
}
