import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { createDeduper, handleInbound, log, type AgentConfig, type InboundMsg } from "./agent.js";
import { createHttpServer, type SendFn } from "./http.js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

const agent: AgentConfig = { agentUrl: need("AGENT_URL").replace(/\/$/, ""), internalToken: need("INTERNAL_TOKEN") };
const gatewaySecret = need("GATEWAY_SECRET");
const port = Number(process.env.PORT ?? 8789);
const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
const useImessage = Boolean(projectId && projectSecret);
const provider = useImessage ? "imessage" : "terminal";
if (!useImessage) log("provider_terminal", { reason: "SPECTRUM_PROJECT_ID/SECRET not set" });

const imApp = useImessage
  ? await Spectrum({ projectId: projectId!, projectSecret: projectSecret!, providers: [imessage.config()] })
  : undefined;
const termApp = imApp ? undefined : await Spectrum({ providers: [terminal.config()] });

const send: SendFn = imApp
  ? async (to, text) => {
      const im = imessage(imApp);
      const dm = await im.space.create(await im.user(to));
      return (await dm.send(text))?.id;
    }
  : async (to, text) => {
      log("terminal_send", { to_len: to.length });
      console.log(`[terminal send -> ${to}] ${text}`);
      return undefined;
    };

type Incoming = [{ responding<T>(fn: () => Promise<T>): Promise<T> }, InboundMsg & { reply(text: string): Promise<unknown> }];
const stream = (): AsyncIterable<Incoming> => (imApp ?? termApp)!.messages as unknown as AsyncIterable<Incoming>;

createHttpServer({ provider, gatewaySecret, send }).listen(port, () => log("listening", { port, provider }));

const isDuplicate = createDeduper(1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let backoff = 1000;
for (;;) {
  try {
    for await (const [space, message] of stream()) {
      backoff = 1000;
      const m = message as unknown as { id?: string; direction?: string; content?: { type?: string }; sender?: { id?: string } };
      log("message_received", { id: m.id, direction: m.direction, type: m.content?.type, has_sender: Boolean(m.sender?.id) });
      try {
        const reply = await handleInbound(agent, message, isDuplicate);
        if (reply) await space.responding(async () => { await message.reply(reply); });
      } catch (err) {
        log("message_error", { id: message.id, error: String(err) });
      }
    }
    log("stream_ended");
  } catch (err) {
    log("stream_error", { error: String(err) });
  }
  await sleep(backoff);
  backoff = Math.min(backoff * 2, 30_000);
}
