"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, Record<string, { kind: "success" | "error"; text: string }>> = {
  google: {
    connected: { kind: "success", text: "Google Calendar connected." },
    denied: { kind: "error", text: "Google Calendar was not connected. You declined access." },
    error: { kind: "error", text: "Google Calendar could not be connected. Try again." },
  },
  fitbit: {
    connected: { kind: "success", text: "Fitbit connected." },
    denied: { kind: "error", text: "Fitbit was not connected. You declined access." },
    error: { kind: "error", text: "Fitbit could not be connected. Try again." },
    notlinked: {
      kind: "error",
      text: "That Google account has no Fitbit data. Pick the Google account your Fitbit uses and try again.",
    },
  },
};

/** Shows one toast for ?google=... or ?fitbit=... after an OAuth return, then clears the query. */
export function ReturnToast({ provider, result }: { provider: string; result: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const m = MESSAGES[provider]?.[result];
    if (m) {
      if (m.kind === "success") toast.success(m.text);
      else toast.error(m.text);
    }
    router.replace(pathname, { scroll: false });
  }, [provider, result, router, pathname]);

  return null;
}
