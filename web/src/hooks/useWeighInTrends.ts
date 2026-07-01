import { useCallback, useEffect, useState } from "react";
import { fetchWeighInTrends } from "../api/farm.api";
import type { WeighInTrendPoint } from "../lib/dashboardAdapters";

export function useWeighInTrends(token: string | null, days = 90) {
  const [points, setPoints] = useState<WeighInTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) {
      setPoints([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchWeighInTrends(token, days);
      if (body && typeof body === "object" && "error" in body && body.error) {
        throw new Error(String(body.error));
      }
      const list = (body as { points?: WeighInTrendPoint[] })?.points;
      setPoints(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load weigh-in trends");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { points, loading, error, reload };
}
