import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { forceMarketDemoFromUrl } from "./demoMarketData";

/**
 * Demo fixtures for Market ops when Postgres isn’t connected.
 * Force with `?demo=1`. Auto-on in DEV when a panel opts in after a DB/API failure.
 */
export function useMarketDemoFlag(apiFailed = false) {
  const [params] = useSearchParams();
  return useMemo(() => {
    if (forceMarketDemoFromUrl(params.toString())) return true;
    if (import.meta.env.DEV && apiFailed) return true;
    return false;
  }, [params, apiFailed]);
}
