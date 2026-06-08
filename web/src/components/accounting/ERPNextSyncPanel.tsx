import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/OdooConnectionContext";
import {
  getErpnextJournalEntries,
  getErpnextSyncLog,
  getERPNextHealth,
  retryFailedErpnextSyncs,
  syncFeedPurchaseToERPNext,
} from "../../api/erpnext.api";
import { getStoredErpnextCompany, getStoredErpnextCostCenter } from "../../lib/erpnextPrefs";
import { ERPNextSyncBadge, type ERPNextSyncState } from "../accounting/ERPNextSyncBadge";
import { useToast } from "../Toast";

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

const POLL_MS = 15000;

export function ERPNextSyncPanel() {
  const { token } = useAuth();
  const { status, refetch } = useERPNextConnection();
  const { showToast } = useToast();
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
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
    if (entry.status === "success") return "synced";
    if (entry.status === "failed") return "failed";
    return "pending";
  }

  const failed = syncLog.filter((e) => e.status === "failed");
  const synced = syncLog.filter((e) => e.status === "success");

  return (
    <section className="space-y-5">
      {!status?.connected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ERPNext is not connected. Configure under <strong>Farm → ERPNext integration</strong> or sign in with
          ERPNext.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-800">Synced (recent)</p>
          <p className="text-2xl font-bold text-emerald-950">{synced.length}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-800">Failed (recent)</p>
          <p className="text-2xl font-bold text-red-950">{failed.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-800">Pending entities</p>
          <p className="text-2xl font-bold text-amber-950">{health?.pendingCount ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-600">API latency</p>
          <p className="text-sm font-semibold text-neutral-900">
            {health?.responseMs != null ? `${health.responseMs} ms` : "—"}
            {health?.authMode ? ` · ${health.authMode}` : ""}
          </p>
          {health?.lastSuccessAt && (
            <p className="text-xs text-neutral-500 mt-1">
              Last OK: {new Date(health.lastSuccessAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          disabled={!status?.connected || !company}
          onClick={() => void retryFeed()}
          className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Test feed sync
        </button>
        <button
          type="button"
          disabled={retrying || failed.length === 0}
          onClick={() => void retryAllFailed()}
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Retry all failed"}
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Recent sync log</h3>
        {syncLog.length === 0 ? (
          <p className="text-sm text-neutral-500">No ERPNext sync events yet.</p>
        ) : (
          <ul className="space-y-2">
            {syncLog.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{entry.eventType}</span>
                  <span className="ml-2 text-xs text-neutral-500">{new Date(entry.at).toLocaleString()}</span>
                  {entry.error && <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>}
                </div>
                <ERPNextSyncBadge state={badgeFor(entry)} reference={entry.erpnextRef} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">ERPNext journal entries</h3>
        {journalEntries.length === 0 ? (
          <p className="text-sm text-neutral-500">No journal entries loaded.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Remark</th>
                  <th className="px-3 py-2">Debit</th>
                </tr>
              </thead>
              <tbody>
                {journalEntries.map((je) => (
                  <tr key={je.name} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-mono text-xs">{je.name}</td>
                    <td className="px-3 py-2">{je.posting_date || "—"}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{je.user_remark || "—"}</td>
                    <td className="px-3 py-2">{je.total_debit?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
