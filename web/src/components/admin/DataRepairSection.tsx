import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { Button, TableToolbar } from "../ui";

type FlockRecoveryOverview = {
  failedFlocks: Array<{ id: string; label: string; status?: string; failedReason?: string; failedAt?: string }>;
  unexpectedStatusFlocks: Array<{ id: string; label: string; status?: string }>;
  orphanReferences: Array<{ source: string; count: number; sampleIds: string[] }>;
  summary?: { failedCount?: number; unexpectedStatusCount?: number; orphanReferenceCount?: number };
};

type Props = {
  embedded?: boolean;
};

/** Superuser-only flock data repair signals (kept out of the flocks ops UI). */
export function DataRepairSection({ embedded = false }: Props) {
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

  const failed = recoveryOverview?.summary?.failedCount ?? recoveryOverview?.failedFlocks.length ?? 0;
  const unexpected =
    recoveryOverview?.summary?.unexpectedStatusCount ?? recoveryOverview?.unexpectedStatusFlocks.length ?? 0;
  const orphans = recoveryOverview?.summary?.orphanReferenceCount ?? 0;

  const body = (
    <>
      <TableToolbar
        meta={recoveryLoading ? "Loading…" : "Flock recovery signals"}
        actions={
          <Button variant="secondary" size="sm" type="button" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      <div className="space-y-3 p-card">
        {recoveryLoading ? (
          <p className="type-caption text-[var(--text-muted)]">Loading recovery signals…</p>
        ) : recoveryOverview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="type-label text-[var(--text-secondary)]">Failed flocks</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{failed}</p>
              </div>
              <div>
                <p className="type-label text-[var(--text-secondary)]">Unexpected status</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{unexpected}</p>
              </div>
              <div>
                <p className="type-label text-[var(--text-secondary)]">Orphan refs</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{orphans}</p>
              </div>
            </div>
            {recoveryOverview.orphanReferences.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {recoveryOverview.orphanReferences.map((r) => (
                  <li key={r.source} className="text-[var(--status-warning)]">
                    {r.source}: {r.count} orphan refs
                    {r.sampleIds.length ? ` (${r.sampleIds.slice(0, 3).join(", ")})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--status-success)]">No orphan references detected.</p>
            )}
            {recoveryOverview.unexpectedStatusFlocks.length > 0 ? (
              <p className="text-sm text-[var(--status-warning)]">
                Unexpected status:{" "}
                {recoveryOverview.unexpectedStatusFlocks
                  .slice(0, 5)
                  .map((f) => `${f.label}(${f.status})`)
                  .join(", ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="type-caption text-[var(--text-muted)]">Recovery overview unavailable.</p>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="table-block">{body}</div>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Data repair</h2>
      <div className="table-block">{body}</div>
    </section>
  );
}
