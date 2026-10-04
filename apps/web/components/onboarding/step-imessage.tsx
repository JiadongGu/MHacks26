"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { createLinkCodeAction } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { agent, errorText, me } from "@/lib/api-client";
import type { LinkChannel } from "@/lib/link-code";

type LinkStatus = "pending" | "linked" | "expired" | "missing";

export const ASI_ONE_AGENT_ADDRESS = "agent1qw9glwdgrmg9tmd7fj9u6wst50d38hwcaat09nck0aml3jvdkrrf6n7pxcv";

type LineState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ready"; line: string }
  | { kind: "error"; message: string };

/** "+14156035536" as "+1 (415) 603-5536" for a US number; anything else is returned as is. */
export function prettyPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function StepImessage({
  photonNumber,
  phone,
  alreadyLinked,
  onLinked,
}: {
  photonNumber: string | null;
  /** The phone saved on the profile, if any. */
  phone: string;
  alreadyLinked: boolean;
  onLinked: () => void;
}) {
  const [typed, setTyped] = useState(phone);
  const [state, setState] = useState<LineState>(phone && !alreadyLinked ? { kind: "busy" } : { kind: "idle" });

  function getLine(withPhone: string) {
    setState({ kind: "busy" });
    void fetchLine(withPhone);
  }

  async function fetchLine(withPhone: string) {
    try {
      const res = await agent<{ line: string; phone: string }>("/channels/imessage/line", {
        body: withPhone ? { phone: withPhone } : {},
      });
      setState({ kind: "ready", line: res.line });
    } catch (err) {
      setState({ kind: "error", message: errorText(err) });
    }
  }

  // A phone already on the profile is registered as soon as this step opens.
  useEffect(() => {
    if (phone && !alreadyLinked) void fetchLine("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-xl space-y-10">
      <section aria-labelledby="link-imessage" className="space-y-4">
        <h3 id="link-imessage" className="text-lg font-semibold">iMessage</h3>
        {state.kind !== "ready" && !alreadyLinked && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              getLine(typed.trim());
            }}
          >
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              Pulse needs your phone number so it can message you and recognise your texts.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="imessage-phone" className="text-sm font-medium">
                  Your phone number
                </label>
                <Input
                  id="imessage-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+13135550123"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="w-56"
                />
              </div>
              <Button type="submit" disabled={state.kind === "busy" || typed.trim() === ""}>
                {state.kind === "busy" ? "Setting up..." : "Get my Pulse number"}
              </Button>
            </div>
            {state.kind === "error" && <ErrorNote>{state.message}</ErrorNote>}
          </form>
        )}
        {(state.kind === "ready" || alreadyLinked) && (
          <LinkBlock
            channel="imessage"
            alreadyLinked={alreadyLinked}
            onLinked={onLinked}
            intro="Open Messages on your phone. Send this code to Pulse. Pulse links your number to your account when it gets the text."
            targetLabel="Text to"
            target={state.kind === "ready" ? prettyPhone(state.line) : photonNumber}
          />
        )}
      </section>
      <section aria-labelledby="link-asi-one" className="space-y-4">
        <h3 id="link-asi-one" className="text-lg font-semibold">ASI:One (optional)</h3>
        <LinkBlock
          channel="asi_one"
          alreadyLinked={false}
          onLinked={() => {}}
          intro="Open ASI:One (asi1.ai), find Pulse Health Agent, and send it this code. Then ask it things like “how did I sleep?”"
          targetLabel="Agent address"
          target={ASI_ONE_AGENT_ADDRESS}
        />
      </section>
    </div>
  );
}

function LinkBlock({
  channel,
  alreadyLinked,
  onLinked,
  intro,
  targetLabel,
  target,
}: {
  channel: LinkChannel;
  alreadyLinked: boolean;
  onLinked: () => void;
  intro: string;
  targetLabel: string;
  target: string | null;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>(alreadyLinked ? "linked" : "pending");
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void createLinkCodeAction(channel).then((res) => {
      if (!live) return;
      if (res.ok) {
        setCode(res.code);
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
    return () => {
      live = false;
    };
  }, [attempt, channel]);

  // Poll every 3 seconds until the gateway marks the link as linked.
  useEffect(() => {
    if (!code || status === "linked") return;
    let live = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await me<{ status: LinkStatus }>(
          `/channel-link?code=${encodeURIComponent(code)}&channel=${channel}`,
        );
        if (!live) return;
        if (res.status === "linked") {
          setStatus("linked");
          toast.success(channel === "asi_one" ? "ASI:One linked." : "iMessage linked.");
          onLinked();
        } else if (res.status === "expired") {
          setCode(null);
          setAttempt((n) => n + 1);
        }
      } catch {
        // A failed poll is not an error for the user. The next tick tries again.
      }
    };
    const id = setInterval(() => void tick(), 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [code, status, onLinked, channel]);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the code and copy it by hand.");
    }
  }

  if (error && !code) {
    return (
      <ErrorNote
        className="max-w-xl"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      >
        {error}
      </ErrorNote>
    );
  }

  return (
    <div className="space-y-6">
      <p className="max-w-[60ch] text-base">{intro}</p>

      {!code ? (
        <Skeleton role="status" aria-label="Making your link code" className="h-28" />
      ) : (
        <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{targetLabel}</dt>
            <dd className={channel === "asi_one" ? "mt-1 break-all font-mono text-xs" : "mt-1 font-mono text-xl"}>
              {target ?? <span className="text-sm text-muted-foreground">Number not configured yet</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Your code</dt>
            <dd className="mt-1 flex items-center gap-3">
              <span className="font-mono text-xl" data-testid={`link-code-${channel}`}>
                {code}
              </span>
              <Button variant="outline" size="sm" onClick={() => void copy()} aria-label="Copy link code">
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </dd>
          </div>
        </dl>
      )}

      <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
        <MessageSquare className="size-4" aria-hidden="true" />
        {status === "linked"
          ? channel === "asi_one"
            ? "Linked. Pulse got your message on ASI:One."
            : "Linked. Pulse got your text."
          : code
            ? "Waiting for your message. Codes expire after 15 minutes; this page makes a new one."
            : "Making your code."}
      </p>
    </div>
  );
}
