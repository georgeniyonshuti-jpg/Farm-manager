import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { readAuthHeaders } from "../lib/authHeaders";
import type { OpsBoardResponse } from "../lib/dashboardAdapters";

type TreatmentRound = { status?: string };
type ForecastRow = { medicineName?: string; daysToStockout?: number | null };

type VetData = {
  opsBoard: OpsBoardResponse | null;
  treatmentRounds: TreatmentRound[];
  medicineForecast: ForecastRow[];
};

type State = {
  data: VetData;
  loading: boolean;
  error: string | null;
};

const empty: VetData = { opsBoard: null, treatmentRounds: [], medicineForecast: [] };

export function useVetDashboardData(token: string | null) {
  const [state, setState] = useState<State>({ data: empty, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const headers = readAuthHeaders(token);
      const [opsRes, roundsRes, forecastRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/farm/ops-board`, { headers }),
        fetch(`${API_BASE_URL}/api/treatment-rounds?limit=250`, { headers }),
        fetch(`${API_BASE_URL}/api/medicine/forecast?lookback_days=30`, { headers }),
      ]);
      const ops = (await opsRes.json().catch(() => ({}))) as OpsBoardResponse & { error?: string };
      const rounds = (await roundsRes.json().catch(() => ({}))) as { rounds?: TreatmentRound[]; error?: string };
      const forecast = (await forecastRes.json().catch(() => ({}))) as { rows?: ForecastRow[]; error?: string };

      if (!opsRes.ok) throw new Error(ops.error ?? "Could not load operations board");
      const treatmentRounds = roundsRes.ok ? rounds.rounds ?? [] : [];
      const medicineForecast = forecastRes.ok ? forecast.rows ?? [] : [];

      setState({
        data: { opsBoard: ops, treatmentRounds, medicineForecast },
        loading: false,
        error: null,
      });
    } catch (e) {
      setState({
        data: empty,
        loading: false,
        error: e instanceof Error ? e.message : "Could not load vet analytics",
      });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
