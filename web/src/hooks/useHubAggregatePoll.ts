import { useEffect } from "react";

/** Field hub aggregate refresh: less aggressive than 15s, pauses when tab/ app in background. */
const AGGREGATE_POLL_MS = 15_000;

/**
 * Initial fetch + interval while `document.visibilityState === "visible"`.
 * On return to visible: immediate refetch and interval restarted.
 */
export function useHubAggregatePoll(load: () => void | Promise<void>) {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const clearTimer = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const armInterval = () => {
      clearTimer();
      if (document.visibilityState !== "visible") return;
      intervalId = window.setInterval(() => void load(), AGGREGATE_POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimer();
        return;
      }
      void load();
      armInterval();
    };

    void load();
    armInterval();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
    };
  }, [load]);
}
