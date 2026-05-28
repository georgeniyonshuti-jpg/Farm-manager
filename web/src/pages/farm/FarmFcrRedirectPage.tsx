import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";

/**
 * Picks the first active flock and opens its cycle FCR page (sidebar has no flock id).
 */
export function FarmFcrRedirectPage() {
  const { token } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to load flocks");
        const id = (d.flocks as { id: string }[] | undefined)?.[0]?.id ?? null;
        if (!cancelled) setTarget(id);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (err) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Cycle FCR" subtitle="Could not load flocks." />
        <ErrorState message={err} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (target) {
    return <Navigate to={`/farm/flocks/${encodeURIComponent(target)}/fcr`} replace />;
  }

  return (
    <div className="mx-auto max-w-lg p-4 text-sm text-neutral-600">
      <PageHeader title="Cycle FCR" subtitle="Loading your flocks…" />
    </div>
  );
}
