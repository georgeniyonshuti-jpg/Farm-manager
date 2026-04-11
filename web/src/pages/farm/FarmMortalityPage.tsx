import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";

type MortalityRow = {
  id: string;
  at: string;
  count: number;
  isEmergency: boolean;
  notes: string;
  source: string;
  linkedCheckinId: string | null;
  submissionStatus?: string;
  affectsLiveCount?: boolean;
};

function MortStatusBadge({ status }: { status?: string }) {
  if (!status || status === "approved") return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">Approved</span>;
  if (status === "pending_review") return <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Pending</span>;
  return <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-800">Rejected</span>;
}

export function FarmMortalityPage() {
  const { token } = useAuth();
  const tFlock = useLaborerT("Flock");
  const tTitle = useLaborerT("Mortality tracking");
  const tLead = useLaborerT(
    "Full report of all mortality events, with filters and export.",
  );
  const tLog = useLaborerT("Log mortality");
  const tTime = useLaborerT("Time");
  const tCount = useLaborerT("Count");
  const tType = useLaborerT("Type");
  const tNotes = useLaborerT("Notes");
  const tStatus = useLaborerT("Status");
  const tLive = useLaborerT("Affects live count");
  const tEmptyTitle = useLaborerT("No mortality logged yet");
  const tEmptyBody = useLaborerT("Submit losses from the mortality log — photos are required.");
  const tNoFlocks = useLaborerT("No flock available");

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error: ctxError,
    loadFlocks,
    loadDetails,
  } = useFlockFieldContext(token);

  const [rows, setRows] = useState<MortalityRow[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadEvents = useCallback(async () => {
    if (!token || !flockId) {
      setRows([]);
      setEventsLoading(false);
      return;
    }
    setEventsError(null);
    setEventsLoading(true);
    try {
      const mr = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/mortality-events`, {
        headers: readAuthHeaders(token),
      });
      const md = await mr.json();
      if (!mr.ok) throw new Error((md as { error?: string }).error ?? "Load failed");
      setRows((md.events as MortalityRow[]) ?? []);
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : "Load failed");
      setRows([]);
    } finally {
      setEventsLoading(false);
    }
  }, [token, flockId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredRows = rows.filter((r) => {
    if (statusFilter !== "all" && (r.submissionStatus ?? "approved") !== statusFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const hay = [r.notes, r.source, r.id].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const loading = listLoading || (eventsLoading && rows.length === 0);
  const pageError = ctxError ?? eventsError;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
      <PageHeader
        title={tTitle}
        subtitle={tLead}
        action={
          <Link
            to="/farm/mortality-log"
            className="inline-flex rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {tLog}
          </Link>
        }
      />

      {!listLoading && !ctxError && flocks.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">{tNoFlocks}</p>
      ) : null}

      {!listLoading && !ctxError && flocks.length > 0 ? (
        <label className="mt-4 block text-sm font-medium text-neutral-700">
          {tFlock}
          <select
            className="mt-1 w-full max-w-md min-h-[44px] rounded-lg border border-neutral-300 px-3 text-base"
            value={flockId}
            onChange={(e) => setFlockId(e.target.value)}
          >
            {flocks.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!listLoading && !ctxError && flockId && !status && detailLoading ? (
        <div className="mt-4">
          <SkeletonList rows={2} />
        </div>
      ) : null}

      {!listLoading && !ctxError && status ? (
        <div className="mt-4">
          <FlockContextStrip
            label={status.label}
            code={flocks.find((f) => f.id === flockId)?.code}
            placementDate={status.placementDate}
            ageDays={status.ageDays}
            feedToDateKg={status.feedToDateKg}
            initialCount={flocks.find((f) => f.id === flockId)?.initialCount}
            birdsLiveEstimate={performance?.birdsLiveEstimate}
            verifiedLiveCount={performance?.verifiedLiveCount}
            mortalityToDate={performance?.mortalityToDate}
          />
        </div>
      ) : null}

      {loading && <SkeletonList rows={4} />}
      {!loading && pageError && (
        <ErrorState
          message={pageError}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
            void loadEvents();
          }}
        />
      )}

      {!loading && !pageError && rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3 items-end">
          <label className="text-sm font-medium text-neutral-700">
            Search
            <input
              className="mt-1 block w-48 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
              placeholder="Notes, source…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            {tStatus}
            <select
              className="mt-1 block w-40 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="pending_review">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <a
            href={`${API_BASE_URL}/api/reports/mortality.csv${flockId ? `?flockId=${encodeURIComponent(flockId)}` : ""}`}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            download
          >
            Export CSV
          </a>
        </div>
      ) : null}

      {!loading && !pageError && filteredRows.length === 0 && flockId ? (
        <EmptyState title={tEmptyTitle} description={tEmptyBody} />
      ) : null}

      {!loading && !pageError && filteredRows.length > 0 ? (
        <>
          <div className="institutional-table-wrapper mt-4 overflow-x-auto">
            <table className="institutional-table min-w-[38rem] text-sm">
              <thead>
                <tr>
                  <th>{tTime}</th>
                  <th>{tCount}</th>
                  <th>{tType}</th>
                  <th>{tStatus}</th>
                  <th>{tLive}</th>
                  <th>{tNotes}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{r.at}</td>
                    <td>{r.count}</td>
                    <td>
                      {r.isEmergency ? (
                        <TranslatedText text="Emergency" />
                      ) : (
                        <TranslatedText text={r.source?.replace(/_/g, " ").trim() || "—"} />
                      )}
                    </td>
                    <td><MortStatusBadge status={r.submissionStatus} /></td>
                    <td>{r.affectsLiveCount !== false ? "Yes" : "No"}</td>
                    <td>{r.notes || <TranslatedText text="—" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
