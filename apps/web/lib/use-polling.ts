"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/api-client";

type Options<T> = {
  /** Name shown in the error toast, for example "Alerts". */
  label: string;
  intervalMs: number;
  /** Data from the server render. With it, the hook does not fetch on mount. */
  initial?: T;
};

/**
 * Loads data and reloads it on a timer. It skips a tick while the tab is hidden.
 * It shows one error toast when a load fails after a good load, not one per tick.
 */
export function usePolling<T>(fetcher: () => Promise<T>, { label, intervalMs, initial }: Options<T>) {
  const [data, setData] = useState<T | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initial === undefined);
  const fetcherRef = useRef(fetcher);
  const failedRef = useRef(false);
  const labelRef = useRef(label);

  useEffect(() => {
    fetcherRef.current = fetcher;
    labelRef.current = label;
  });

  const refresh = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(null);
      failedRef.current = false;
    } catch (err) {
      const text = errorText(err);
      setError(text);
      if (!failedRef.current) toast.error(`${labelRef.current}: ${text}`);
      failedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial === undefined) void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [initial, intervalMs, refresh]);

  return { data, setData, error, loading, refresh };
}
