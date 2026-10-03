import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { log } from "./agent.js";

export type SendFn = (to: string, text: string) => Promise<string | undefined>;

export interface HttpDeps {
  provider: "imessage" | "terminal";
  gatewaySecret: string;
  send: SendFn;
}

const MAX_BODY = 64 * 1024;

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createHttpServer(deps: HttpDeps): Server {
  return createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    try {
      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { ok: true, provider: deps.provider });
      }
      if (req.method === "POST" && path === "/send") {
        const auth = req.headers.authorization ?? "";
        if (!deps.gatewaySecret || !safeEqual(auth, `Bearer ${deps.gatewaySecret}`)) {
          return json(res, 401, { ok: false, error: "unauthorized" });
        }
        let body: { to?: unknown; text?: unknown };
        try {
          body = (await readJson(req)) as typeof body;
        } catch {
          return json(res, 400, { ok: false, error: "invalid json" });
        }
        if (typeof body?.to !== "string" || !body.to || typeof body.text !== "string" || !body.text) {
          return json(res, 400, { ok: false, error: "to and text must be non-empty strings" });
        }
        const started = Date.now();
        try {
          const message_id = await deps.send(body.to, body.text);
          log("send_ok", { ms: Date.now() - started });
          return json(res, 200, { ok: true, message_id });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          log("send_error", { ms: Date.now() - started, error });
          return json(res, 502, { ok: false, error });
        }
      }
      return json(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      log("http_error", { error: String(err) });
      return json(res, 500, { ok: false, error: "internal error" });
    }
  });
}
