import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { DEFAULT_PLANS, type Plan } from "../lib/plans";

type Options = {
  /** Public catalog only (default). Set false for super-admin list including inactive. */
  activeOnly?: boolean;
  token?: string | null;
};

type State = {
  plans: Plan[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useBillingPlans(options: Options = {}) {
  const { activeOnly = true, token = null } = options;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<State, "reload">>({
    plans: DEFAULT_PLANS,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!activeOnly && !token) {
      setState({ plans: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const path = activeOnly ? "/api/billing/plans" : "/api/super-admin/plans";
        const res = await fetch(`${API_BASE_URL}${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const body = (await res.json()) as { plans?: Plan[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Could not load plans.");
        if (!cancelled) {
          setState({
            plans: body.plans?.length ? body.plans : activeOnly ? DEFAULT_PLANS : [],
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            plans: activeOnly ? DEFAULT_PLANS : [],
            loading: false,
            error: err instanceof Error ? err.message : "Could not load plans.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOnly, token, tick]);

  return {
    ...state,
    reload: () => setTick((n) => n + 1),
  };
}
