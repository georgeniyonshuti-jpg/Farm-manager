import { useCallback, useEffect, useState } from "react";
import { fetchOpsBoard } from "../api/farm.api";
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
      const body = (await fetchOpsBoard(token)) as OpsBoardResponse & { error?: string };
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
