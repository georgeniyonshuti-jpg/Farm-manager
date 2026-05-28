import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { readAuthHeaders } from "../lib/authHeaders";
import type { OpsBoardResponse } from "../lib/dashboardAdapters";

type State = {
  data: OpsBoardResponse | null;
  loading: boolean;
  error: string | null;
};

export function useOpsBoardData(token: string | null) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/farm/ops-board`, { headers: readAuthHeaders(token) });
      const body = (await res.json().catch(() => ({}))) as OpsBoardResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load operations board");
      setState({ data: body, loading: false, error: null });
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: e instanceof Error ? e.message : "Could not load operations board",
      });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
