"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { createLinkCodeAction } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { me } from "@/lib/api-client";

type LinkStatus = "pending" | "linked" | "missing";

export function StepImessage({
  photonNumber,
  alreadyLinked,
  onLinked,
}: {
  photonNumber: string | null;
  alreadyLinked: boolean;
  onLinked: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>(alreadyLinked ? "linked" : "pending");
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void createLinkCodeAction().then((res) => {
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
  }, [attempt]);

  // Poll every 3 seconds until the gateway marks the link as linked.
  useEffect(() => {
    if (!code || status === "linked") return;
    let live = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await me<{ status: LinkStatus }>(`/channel-link?code=${encodeURIComponent(code)}`);
        if (!live) return;
        if (res.status === "linked") {
          setStatus("linked");
          toast.success("iMessage linked.");
          onLinked();
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
  }, [code, status, onLinked]);

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
    <div className="max-w-xl space-y-6">
      <p className="max-w-[60ch] text-base">
        Open Messages on your phone. Send this code to Pulse. Pulse links your number to your account when
        it gets the text.
      </p>

      {!code ? (
        <Skeleton role="status" aria-label="Making your link code" className="h-28" />
      ) : (
        <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Text to</dt>
            <dd className="mt-1 font-mono text-xl">
              {photonNumber ?? <span className="text-sm text-muted-foreground">Number not configured yet</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Your code</dt>
            <dd className="mt-1 flex items-center gap-3">
              <span className="font-mono text-xl" data-testid="link-code">
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
          ? "Linked. Pulse got your text."
          : code
            ? "Waiting for your text. This page checks every 3 seconds."
            : "Making your code."}
      </p>
    </div>
  );
}
