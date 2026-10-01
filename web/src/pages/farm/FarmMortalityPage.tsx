import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import {
  Button,
  DataTable,
  FacetFilter,
  SegmentedControl,
  StatusPill,
  TableToolbar,
  ToolbarSearch,
  type DataColumn,
} from "../../components/ui";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useErpnextSyncBySource } from "../../hooks/useErpnextSyncBySource";
import { ERPNextSyncBadge } from "../../components/accounting/ERPNextSyncBadge";

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
  accountingStatus?: string | null;
};

function MortStatusBadge({ status }: { status?: string }) {
  if (!status || status === "approved") return <StatusPill tone="success">Approved</StatusPill>;
  if (status === "pending_review") return <StatusPill tone="warning">Pending</StatusPill>;
  return <StatusPill tone="danger">Rejected</StatusPill>;
}

export function FarmMortalityPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { companyHref } = useCompanyNav();
  const { bySource } = useErpnextSyncBySource(user?.erpnextAccess ? token : null);
  const tFlock = useLaborerT("Flock");
  const tTitle = useLaborerT("Mortality tracking");
  const tLog = useLaborerT("Log mortality");
  const tTime = useLaborerT("Time");
  const tCount = useLaborerT("Count");
  const tType = useLaborerT("Type");
  const tNotes = useLaborerT("Notes");
  const tStatus = useLaborerT("Status");
  const tLive = useLaborerT("Affects live count");
  const tEmptyTitle = useLaborerT("No mortality logged yet");
  const tNoFlocks = useLaborerT("No flock available");

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    error: ctxError,
    loadFlocks,
    loadDetails,
  } = useFlockFieldContext(token, { defaultFlockId: "" });

  const [rows, setRows] = useState<MortalityRow[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadEvents = useCallback(async () => {
    if (!token) {
      setRows([]);
      setEventsLoading(false);
      return;
    }
    setEventsError(null);
    setEventsLoading(true);
    try {
      if (!flockId) {
        if (flocks.length === 0) {
          setRows([]);
          return;
        }
        const batches = await Promise.all(
          flocks.map(async (f) => {
            const mr = await fetch(
              `${API_BASE_URL}/api/flocks/${encodeURIComponent(f.id)}/mortality-events`,
              { headers: readAuthHeaders(token) }
            );
            const md = await mr.json();
            if (!mr.ok) throw new Error((md as { error?: string }).error ?? "Load failed");
            return (md.events as MortalityRow[]) ?? [];
          })
        );
        const merged = batches.flat().sort((a, b) => (a.at < b.at ? 1 : -1));
        setRows(merged);
        return;
      }
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
  }, [token, flockId, flocks]);

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
  const isFiltered = statusFilter !== "all" || searchQ.trim().length > 0;

  const columns: DataColumn<MortalityRow>[] = useMemo(
    () => [
      {
        key: "time",
        header: tTime,
        render: (r) => (
          <span className="tabular-nums" title={r.at}>
            {formatManagerDateTime(r.at)}
          </span>
        ),
      },
      {
        key: "count",
        header: tCount,
        numeric: true,
        render: (r) => <span className="font-semibold">{r.count}</span>,
      },
      {
        key: "type",
        header: tType,
        badge: true,
        render: (r) =>
          r.isEmergency ? (
            <StatusPill tone="danger">
              <TranslatedText text="Emergency" />
            </StatusPill>
          ) : (
            <TranslatedText text={r.source?.replace(/_/g, " ").trim() || "—"} />
          ),
      },
      {
        key: "status",
        header: tStatus,
        badge: true,
        render: (r) => <MortStatusBadge status={r.submissionStatus} />,
      },
      ...(user?.erpnextAccess
        ? [
            {
              key: "erpnext",
              header: "ERPNext",
              badge: true,
              render: (r: MortalityRow) => {
                const hint = bySource.get(r.id);
                if (!hint) return null;
                return (
                  <ERPNextSyncBadge
                    state={hint.state}
                    reference={hint.reference}
                    compact
                    href={companyHref(`farm/erpnext-setup?q=${encodeURIComponent(r.id)}`)}
                  />
                );
              },
            } as DataColumn<MortalityRow>,
          ]
        : []),
      {
        key: "live",
        header: tLive,
        badge: true,
        render: (r) => (
          <StatusPill tone={r.affectsLiveCount !== false ? "info" : "neutral"}>
            {r.affectsLiveCount !== false ? "Yes" : "No"}
          </StatusPill>
        ),
      },
      {
        key: "notes",
        header: tNotes,
        render: (r) => <span className="max-w-[14rem] block truncate">{r.notes || "—"}</span>,
      },
    ],
    [tTime, tCount, tType, tStatus, tLive, tNotes, user?.erpnextAccess, bySource, companyHref]
  );

  return (
    <ManagerPage>
      <PageHeader
        title={tTitle}
        primaryAction={{ label: tLog, onClick: () => navigate(companyHref("/farm/mortality-log")) }}
      />

      {!listLoading && !ctxError && flocks.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{tNoFlocks}</p>
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

      {!loading && !pageError && !listLoading && !ctxError && flocks.length > 0 ? (
        <div className="table-block">
          <DataTable<MortalityRow>
            flush
            columns={columns}
            rows={filteredRows}
            rowKey={(r) => r.id}
            isFiltered={isFiltered || Boolean(flockId)}
            emptyTitle={tEmptyTitle}
            emptyDescription=""
            filteredEmptyTitle={tEmptyTitle}
            filteredEmptyDescription=""
            emptyAction={
              <Link to="../mortality-log">
                <Button variant="primary" size="sm">
                  Go to mortality log
                </Button>
              </Link>
            }
            toolbar={
              <TableToolbar
                filters={
                  <>
                    <SegmentedControl
                      size="sm"
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: "all", label: "All" },
                        { value: "pending_review", label: "Pending" },
                        { value: "approved", label: "Approved" },
                        { value: "rejected", label: "Rejected" },
                      ]}
                    />
                    <FacetFilter
                      label={tFlock}
                      value={flockId || "all"}
                      allValue="all"
                      allLabel="All flocks"
                      onChange={(v) => setFlockId(v === "all" ? "" : v)}
                      options={flocks.map((f) => ({ value: f.id, label: f.label }))}
                    />
                  </>
                }
                search={
                  <ToolbarSearch
                    placeholder="Search notes, source…"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    label="Search mortality"
                  />
                }
                meta={
                  flockId && status
                    ? `Day ${status.ageDays} · Live ${performance?.birdsLiveEstimate ?? "—"} · Mort ${performance?.mortalityToDate ?? "—"} · ${filteredRows.length} rows`
                    : `${filteredRows.length} rows`
                }
                actions={
                  <a
                    href={`${API_BASE_URL}/api/reports/mortality.csv${flockId ? `?flockId=${encodeURIComponent(flockId)}` : ""}`}
                    className="inline-flex h-control-sm items-center rounded-control px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]"
                    download
                  >
                    Export CSV
                  </a>
                }
              />
            }
            renderMobileCard={(r) => (
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums">{r.count} birds</span>
                  <MortStatusBadge status={r.submissionStatus} />
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatManagerDateTime(r.at)}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{r.notes || "—"}</p>
              </div>
            )}
          />
        </div>
      ) : null}
    </ManagerPage>
  );
}
