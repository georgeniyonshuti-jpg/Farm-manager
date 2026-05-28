import { useEffect, useState } from "react";
import { apiUrl } from "../api/fetchClient";

export type ApiHealthStatus = "up" | "down" | "checking";

/**
 * Health probe for the loading screen — avoids showing "down" during initial slow start.
 */
export function useApiHealthStatus(enabled: boolean): ApiHealthStatus {
  const [apiStatus, setApiStatus] = useState<ApiHealthStatus>("checking");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let downTimer: ReturnType<typeof setTimeout> | null = null;

    const checkApi = async () => {
      try {
        const res = await fetch(apiUrl("/health"), { signal: AbortSignal.timeout(5000) });
        if (cancelled) return;
        setApiStatus(res.ok ? "up" : "down");
      } catch {
        if (!cancelled) {
          downTimer = setTimeout(() => {
            if (!cancelled) setApiStatus("down");
          }, 3000);
        }
      }
    };

    void checkApi();
    return () => {
      cancelled = true;
      if (downTimer) clearTimeout(downTimer);
    };
  }, [enabled]);

  return apiStatus;
}
