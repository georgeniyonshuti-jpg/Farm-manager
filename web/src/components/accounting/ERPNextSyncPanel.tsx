import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/ERPNextConnectionContext";
import {
  getErpnextJournalEntries,
  getErpnextSyncLog,
  getERPNextHealth,
  retryFailedErpnextSyncs,
  syncFeedPurchaseToERPNext,
} from "../../api/erpnext.api";
import { getStoredErpnextCompany, getStoredErpnextCostCenter } from "../../lib/erpnextPrefs";
import { ERPNextSyncBadge, type ERPNextSyncState } from "./ERPNextSyncBadge";
import { useToast } from "../Toast";
import { DataTable, type DataColumn } from "../ui/DataTable";
import { TableToolbar } from "../ui/TableToolbar";
import { SegmentedControl } from "../ui/Field";
import { ToolbarSearch } from "../ui/ToolbarSearch";
import { Button } from "../ui/Button";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";
import { useTableQueryParams } from "../../hooks/useTableQueryParams";

type SyncLogEntry = {
  id: string;
  at: string;
  status: string;
  eventType: string;
  sourceId: string | null;
  erpnextRef: string | null;
  error: string | null;
};

type JournalEntry = {
  name: string;
  posting_date?: string;
  user_remark?: string;
  total_debit?: number;
};

type HealthInfo = {
  ok?: boolean;
  responseMs?: number;
  failedLast24h?: number;
  pendingCount?: number;
  lastSuccessAt?: string | null;
  authMode?: string;
};

type StatusFilter = "all" | "success" | "failed" | "pending";

const POLL_MS = 15000;

function normalizeStatus(status: string): "success" | "failed" | "pending" {
  if (status === "success" || status === "sent") return "success";
  if (status === "failed") return "failed";
  return "pending";
}

export function ERPNextSyncPanel({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuth();
  const { status, refetch } = useERPNextConnection();
  const { showToast } = useToast();
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { values: query, setValue: setQuery } = useTableQueryParams({
    status: "all",
    q: "",
  });
  const statusFilter = (query.status as StatusFilter) || "all";
  const search = query.q;
  const setStatusFilter = (v: StatusFilter) => setQuery("status", v);
  const setSearch = (v: string) => setQuery("q", v);
  const [errorOpenId, setErrorOpenId] = useState<string | null>(null);
  const prevFailedRef = useRef(0);

  const company = getStoredErpnextCompany() || status?.company || "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [logData, healthData] = await Promise.all([
        getErpnextSyncLog(token, 25),
        getERPNextHealth(token).catch(() => null),
      ]);
      const entries = Array.isArray(logData?.entries) ? logData.entries : [];
      setSyncLog(entries);
      setHealth(healthData);

      const failedNow = entries.filter((e: SyncLogEntry) => e.status === "failed").length;
      if (failedNow > prevFailedRef.current && prevFailedRef.current > 0) {
        showToast("error", "New ERPNext sync failure detected.");
      }
      prevFailedRef.current = failedNow;

      if (company) {
        const je = await getErpnextJournalEntries(token, company, 15);
        setJournalEntries(Array.isArray(je) ? je : []);
      } else {
        setJournalEntries([]);
      }
    } finally {
      setLoading(false);
    }
  }, [token, company, showToast]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  async function retryFeed() {
    if (!token || !company) return;
    try {
      await syncFeedPurchaseToERPNext(token, {
        company,
        supplier: "Farm Feed Supplier",
        date: new Date().toISOString().slice(0, 10),
        feedType: "Retry sync",
        quantity: 1,
        unitPrice: 0,
        totalAmount: 0,
        costCenter: getStoredErpnextCostCenter() || undefined,
      });
      showToast("success", "Test feed sync sent to ERPNext.");
      void load();
      void refetch();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Sync failed");
    }
  }

  async function retryAllFailed() {
    if (!token) return;
    setRetrying(true);
    try {
      const result = await retryFailedErpnextSyncs(token);
      const count = Array.isArray(result?.retried) ? result.retried.length : 0;
      showToast("success", `Retried ${count} failed sync(s).`);
      void load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  function badgeFor(entry: SyncLogEntry): ERPNextSyncState {
    const n = normalizeStatus(entry.status);
    if (n === "success") return "synced";
    if (n === "failed") return "failed";
    return "pending";
  }

  const counts = useMemo(() => {
    let success = 0;
    let failed = 0;
    let pending = 0;
    for (const e of syncLog) {
      const n = normalizeStatus(e.status);
      if (n === "success") success += 1;
      else if (n === "failed") failed += 1;
      else pending += 1;
    }
    return { success, failed, pending, all: syncLog.length };
  }, [syncLog]);

  const filteredLog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return syncLog.filter((e) => {
      if (statusFilter !== "all" && normalizeStatus(e.status) !== statusFilter) return false;
      if (!q) return true;
      const hay = [e.eventType, e.erpnextRef, e.error, e.sourceId, e.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [syncLog, statusFilter, search]);

  const isFiltered = statusFilter !== "all" || search.trim().length > 0;

  const syncColumns: DataColumn<SyncLogEntry>[] = [
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <span className="inline-flex rounded-full border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
          {row.eventType}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      badge: true,
      render: (row) => (
        <div className="relative inline-flex flex-col items-start gap-1">
          <button
            type="button"
            className="text-left"
            onClick={(e) => {
              e.stopPropagation();
              if (row.error) setErrorOpenId((id) => (id === row.id ? null : row.id));
            }}
            title={row.error ? "Show error" : undefined}
          >
            <ERPNextSyncBadge state={badgeFor(row)} reference={row.erpnextRef} />
          </button>
          {errorOpenId === row.id && row.error ? (
            <p className="max-w-xs rounded-md border border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)] px-2 py-1 text-[11px] text-[var(--status-danger)]">
              {row.error}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "ref",
      header: "ERPNext document",
      className: "tbl-mono",
      render: (row) => (
        <span className="text-[var(--text-secondary)]">{row.erpnextRef || "—"}</span>
      ),
    },
    {
      key: "at",
      header: "When",
      render: (row) => (
        <span className="text-xs text-[var(--text-muted)]" title={row.at}>
          {formatManagerDateTime(row.at)}
        </span>
      ),
    },
  ];

  const journalColumns: DataColumn<JournalEntry>[] = [
    {
      key: "name",
      header: "Name",
      className: "tbl-mono",
      render: (row) => row.name,
    },
    {
      key: "date",
      header: "Date",
      render: (row) => row.posting_date || "—",
    },
    {
      key: "remark",
      header: "Remark",
      render: (row) => (
        <span className="max-w-xs truncate text-[var(--text-secondary)]">{row.user_remark || "—"}</span>
      ),
    },
    {
      key: "debit",
      header: "Debit",
      numeric: true,
      render: (row) => row.total_debit?.toLocaleString() ?? "—",
    },
  ];

  return (
    <section className={embedded ? "space-y-stack" : "space-y-5"}>
      {!embedded && !status?.connected && (
        <div className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-soft)] p-4 text-sm text-[var(--status-warning)]">
          ERPNext is not connected. Configure under <strong>Farm → ERPNext</strong> or sign in with ERPNext.
        </div>
      )}

      {!embedded && (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--status-success)]/30 bg-[var(--status-success-soft)] p-4">
          <p className="text-xs font-medium text-[var(--status-success)]">Synced (recent)</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{counts.success}</p>
        </div>
        <div className="rounded-lg border border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)] p-4">
          <p className="text-xs font-medium text-[var(--status-danger)]">Failed (recent)</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{counts.failed}</p>
        </div>
        <div className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-soft)] p-4">
          <p className="text-xs font-medium text-[var(--status-warning)]">Pending entities</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{health?.pendingCount ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
          <p className="text-xs font-medium text-[var(--text-muted)]">API latency</p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {health?.responseMs != null ? `${health.responseMs} ms` : "—"}
            {health?.authMode ? ` · ${health.authMode}` : ""}
          </p>
          {health?.lastSuccessAt ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Last OK: {formatManagerDateTime(health.lastSuccessAt)}
            </p>
          ) : null}
        </div>
      </div>
      )}

      {!embedded ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!status?.connected || !company}
            onClick={() => void retryFeed()}
          >
            Test feed sync
          </Button>
          <Button
            type="button"
            variant="dangerGhost"
            size="sm"
            disabled={retrying || counts.failed === 0}
            onClick={() => void retryAllFailed()}
          >
            {retrying ? "Retrying…" : "Retry all failed"}
          </Button>
        </div>
      ) : null}

      <div className={embedded ? "table-block" : "space-y-2"}>
        {!embedded ? <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sync log</h3> : null}
        <DataTable<SyncLogEntry>
          columns={syncColumns}
          rows={filteredLog}
          rowKey={(row) => row.id}
          flush={embedded}
          isFiltered={isFiltered}
          emptyTitle="No sync events yet"
          emptyDescription=""
          filteredEmptyTitle="No matching sync events"
          filteredEmptyDescription=""
          toolbar={
            <TableToolbar
              filters={
                <SegmentedControl
                  size="sm"
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as StatusFilter)}
                  options={[
                    { value: "all", label: "All", badge: counts.all || undefined },
                    { value: "success", label: "Sent", badge: counts.success || undefined },
                    { value: "failed", label: "Failed", badge: counts.failed || undefined },
                    { value: "pending", label: "Pending", badge: counts.pending || undefined },
                  ]}
                />
              }
              search={
                <ToolbarSearch
                  placeholder="Search type, doc, error…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  label="Search sync log"
                />
              }
              meta={`${filteredLog.length} of ${syncLog.length}`}
              actions={
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
                    {loading ? "Refreshing…" : "Refresh"}
                  </Button>
                  {embedded ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!status?.connected || !company}
                        onClick={() => void retryFeed()}
                      >
                        Test sync
                      </Button>
                      <Button
                        type="button"
                        variant="dangerGhost"
                        size="sm"
                        disabled={retrying || counts.failed === 0}
                        onClick={() => void retryAllFailed()}
                      >
                        {retrying ? "Retrying…" : "Retry failed"}
                      </Button>
                    </>
                  ) : null}
                </>
              }
            />
          }
          renderMobileCard={(row) => (
            <div className="space-y-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{row.eventType}</span>
                <ERPNextSyncBadge state={badgeFor(row)} compact />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {row.erpnextRef ? `${row.erpnextRef} · ` : ""}
                {formatManagerDateTime(row.at)}
              </p>
              {row.error ? <p className="text-xs text-[var(--status-danger)]">{row.error}</p> : null}
            </div>
          )}
        />
      </div>

      <div className={embedded ? "table-block" : "space-y-2"}>
        <div
          className={
            embedded
              ? "border-b border-[var(--border-color)] px-3 py-2"
              : undefined
          }
        >
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Journal entries</h3>
        </div>
        <DataTable<JournalEntry>
          columns={journalColumns}
          rows={journalEntries}
          rowKey={(row) => row.name}
          flush={embedded}
          emptyTitle="No journal entries"
          emptyDescription=""
          renderMobileCard={(row) => (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
              <p className="font-mono text-xs font-semibold">{row.name}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {row.posting_date || "—"} · {row.total_debit?.toLocaleString() ?? "—"}
              </p>
              <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{row.user_remark || "—"}</p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
