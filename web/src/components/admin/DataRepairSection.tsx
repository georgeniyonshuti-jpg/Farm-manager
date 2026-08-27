import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type FlockRecoveryOverview = {
  failedFlocks: Array<{ id: string; label: string; status?: string; failedReason?: string; failedAt?: string }>;
  unexpectedStatusFlocks: Array<{ id: string; label: string; status?: string }>;
  orphanReferences: Array<{ source: string; count: number; sampleIds: string[] }>;
  summary?: { failedCount?: number; unexpectedStatusCount?: number; orphanReferenceCount?: number };
};

/** Superuser-only flock data repair signals (kept out of the flocks ops UI). */
export function DataRepairSection() {
  const { token } = useAuth();
  const [recoveryOverview, setRecoveryOverview] = useState<FlockRecoveryOverview | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setRecoveryLoading(true);
    try {
      const rr = await fetch(`${API_BASE_URL}/api/flocks/recovery-overview`, {
        headers: readAuthHeaders(token),
      });
      const rd = await rr.json().catch(() => ({}));
      if (rr.ok) {
        setRecoveryOverview({
          failedFlocks: (rd as { failedFlocks?: FlockRecoveryOverview["failedFlocks"] }).failedFlocks ?? [],
          unexpectedStatusFlocks:
            (rd as { unexpectedStatusFlocks?: FlockRecoveryOverview["unexpectedStatusFlocks"] })
              .unexpectedStatusFlocks ?? [],
          orphanReferences:
            (rd as { orphanReferences?: FlockRecoveryOverview["orphanReferences"] }).orphanReferences ?? [],
          summary: (rd as { summary?: FlockRecoveryOverview["summary"] }).summary,
        });
      } else {
        setRecoveryOverview(null);
      }
    } catch {
      setRecoveryOverview(null);
    } finally {
      setRecoveryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card level="subtle" className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="type-h3 text-[var(--text-primary)]">Data repair</p>
          <p className="type-caption mt-0.5">
            Superuser diagnostics for failed flocks, unexpected statuses, and orphan references.
          </p>
        </div>
        <Button variant="secondary" size="sm" type="button" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {recoveryLoading ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Loading recovery signals…</p>
      ) : recoveryOverview ? (
        <div className="mt-2 space-y-2 text-xs">
          <p className="text-[var(--text-secondary)]">
            Failed:{" "}
            <strong>{recoveryOverview.summary?.failedCount ?? recoveryOverview.failedFlocks.length}</strong> · Unexpected
            statuses:{" "}
            <strong>
              {recoveryOverview.summary?.unexpectedStatusCount ?? recoveryOverview.unexpectedStatusFlocks.length}
            </strong>{" "}
            · Orphan refs: <strong>{recoveryOverview.summary?.orphanReferenceCount ?? 0}</strong>
          </p>
          {recoveryOverview.orphanReferences.length > 0 ? (
            <ul className="space-y-1">
              {recoveryOverview.orphanReferences.map((r) => (
                <li key={r.source} className="text-[var(--status-warning)]">
                  {r.source}: {r.count} orphan refs{" "}
                  {r.sampleIds.length ? `(${r.sampleIds.slice(0, 3).join(", ")})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--status-success)]">No orphan references detected.</p>
          )}
          {recoveryOverview.unexpectedStatusFlocks.length > 0 ? (
            <p className="text-[var(--status-warning)]">
              Unexpected status flocks:{" "}
              {recoveryOverview.unexpectedStatusFlocks
                .slice(0, 5)
                .map((f) => `${f.label}(${f.status})`)
                .join(", ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">Recovery overview unavailable.</p>
      )}
    </Card>
  );
}
