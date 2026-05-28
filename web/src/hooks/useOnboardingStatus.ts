import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { useAuth } from "../auth/AuthContext";

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  is_active: boolean;
  payment_overdue?: boolean;
};

type OnboardingStatus = {
  company: CompanySummary | null;
  flockCount: number;
  teamCount: number;
  trialExpired: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useOnboardingStatus(): OnboardingStatus {
  const { token, user } = useAuth();
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [flockCount, setFlockCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [trialExpired, setTrialExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !token) {
      setCompany(null);
      setFlockCount(0);
      setTeamCount(0);
      setTrialExpired(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as OnboardingStatus & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load workspace status.");
      setCompany(body.company ?? null);
      setFlockCount(body.flockCount ?? 0);
      setTeamCount(body.teamCount ?? 0);
      setTrialExpired(Boolean(body.trialExpired));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace status.");
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { company, flockCount, teamCount, trialExpired, loading, error, refresh };
}
