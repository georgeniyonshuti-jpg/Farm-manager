import { useCallback, useEffect, useMemo, useState } from "react";
import { getErpnextSyncLog } from "../api/erpnext.api";
import type { ERPNextSyncState } from "../components/accounting/ERPNextSyncBadge";

type SyncEntry = {
  id: string;
  status: string;
  sourceId: string | null;
  erpnextRef: string | null;
};

function toState(status: string): ERPNextSyncState {
  if (status === "success" || status === "sent") return "synced";
  if (status === "failed") return "failed";
  return "pending";
}

/**
 * Lightweight index of recent ERPNext sync-log rows by sourceId.
 * Used for optional ops-list chips — absent when no evidence (no false pending).
 */
export function useErpnextSyncBySource(token: string | null | undefined) {
  const [entries, setEntries] = useState<SyncEntry[]>([]);

  const load = useCallback(async () => {
    if (!token) {
      setEntries([]);
      return;
    }
    try {
      const data = await getErpnextSyncLog(token, 80);
      const list = Array.isArray(data?.entries) ? data.entries : [];
      setEntries(
        list.map((e: SyncEntry) => ({
          id: String(e.id),
          status: String(e.status || ""),
          sourceId: e.sourceId != null ? String(e.sourceId) : null,
          erpnextRef: e.erpnextRef != null ? String(e.erpnextRef) : null,
        }))
      );
    } catch {
      setEntries([]);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const bySource = useMemo(() => {
    const map = new Map<string, { state: ERPNextSyncState; reference: string | null }>();
    for (const e of entries) {
      if (!e.sourceId) continue;
      if (map.has(e.sourceId)) continue;
      map.set(e.sourceId, { state: toState(e.status), reference: e.erpnextRef });
    }
    return map;
  }, [entries]);

  return { bySource, reload: load };
}
