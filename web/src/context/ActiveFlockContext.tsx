import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useParams } from "react-router-dom";
import {
  readStoredActiveFlock,
  resolveActiveFlockId,
  writeStoredActiveFlock,
} from "../lib/activeFlockStorage";
import { readFlockIdFromSearch } from "../lib/fieldRoutes";
import { stripTenantPrefix } from "../lib/tenancy";
import {
  triageNeedsAction,
  type FieldFlockTriageMode,
} from "../components/field/fieldFlockTriage";

export type FieldFlockTriageRow = {
  flockId: string;
  label: string;
  isOverdue: boolean;
  overdueMinutes: number;
  nextDueAt: string;
  visitDoneToday?: boolean;
  checkinDoneToday?: boolean;
};

type ActiveFlockContextValue = {
  activeFlockId: string;
  setActiveFlockId: (id: string, options?: { syncUrl?: boolean }) => void;
  clearActiveFlock: () => void;
  primaryFlockId: string | null;
  setPrimaryFlockId: (id: string | null) => void;
  triageFlockList: FieldFlockTriageRow[];
  setTriageFlockList: (rows: FieldFlockTriageRow[]) => void;
  advanceToNextOverdueFlock: (completedFlockId?: string, mode?: FieldFlockTriageMode) => string | null;
};

const ActiveFlockContext = createContext<ActiveFlockContextValue | null>(null);

function isFarmScopedPath(appPath: string): boolean {
  return appPath.startsWith("/farm/") || appPath.startsWith("/laborer/");
}

function triageRowsEqual(a: FieldFlockTriageRow[], b: FieldFlockTriageRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.flockId === b[i].flockId &&
      row.label === b[i].label &&
      row.isOverdue === b[i].isOverdue &&
      row.overdueMinutes === b[i].overdueMinutes &&
      row.nextDueAt === b[i].nextDueAt &&
      Boolean(row.visitDoneToday) === Boolean(b[i].visitDoneToday) &&
      Boolean(row.checkinDoneToday) === Boolean(b[i].checkinDoneToday)
  );
}

export function ActiveFlockProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug?: string }>();
  const tenantSlug = slug ?? "default-farm";
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const [activeFlockId, setActiveFlockIdState] = useState("");
  const activeFlockRef = useRef(activeFlockId);
  activeFlockRef.current = activeFlockId;
  const [primaryFlockId, setPrimaryFlockId] = useState<string | null>(null);
  const [triageFlockList, setTriageFlockList] = useState<FieldFlockTriageRow[]>([]);

  const urlFlockId = readFlockIdFromSearch(location.search);

  const setActiveFlockId = useCallback(
    (id: string, options?: { syncUrl?: boolean }) => {
      const next = id.trim();
      if (activeFlockRef.current !== next) {
        activeFlockRef.current = next;
        writeStoredActiveFlock(tenantSlug, next || null);
        setActiveFlockIdState(next);
      }

      const syncUrl = options?.syncUrl !== false;
      const appPath = stripTenantPrefix(location.pathname);
      if (!syncUrl || !isFarmScopedPath(appPath)) return;

      const currentUrlId = readFlockIdFromSearch(location.search);
      if (next && currentUrlId === next) return;
      if (!next && !currentUrlId) return;

      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set("flockId", next);
          else p.delete("flockId");
          return p;
        },
        { replace: true }
      );
    },
    [tenantSlug, location.pathname, location.search, setSearchParams]
  );

  const setPrimaryFlockIdStable = useCallback((id: string | null) => {
    setPrimaryFlockId((prev) => (prev === id ? prev : id));
  }, []);

  const setTriageFlockListStable = useCallback((rows: FieldFlockTriageRow[]) => {
    setTriageFlockList((prev) => (triageRowsEqual(prev, rows) ? prev : rows));
  }, []);

  const clearActiveFlock = useCallback(() => {
    setActiveFlockIdState("");
    writeStoredActiveFlock(tenantSlug, null);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("flockId");
        return p;
      },
      { replace: true }
    );
  }, [tenantSlug, setSearchParams]);

  const advanceToNextOverdueFlock = useCallback(
    (completedFlockId?: string, mode: FieldFlockTriageMode = "vet_visit"): string | null => {
      if (!triageFlockList.length) return null;
      const sorted = [...triageFlockList].sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.isOverdue && b.isOverdue) return b.overdueMinutes - a.overdueMinutes;
        return new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime();
      });
      const remaining = sorted.filter((r) => r.flockId !== completedFlockId);
      const next =
        remaining.find((r) => r.isOverdue) ??
        remaining.find((r) => triageNeedsAction(r, mode)) ??
        remaining[0];
      if (!next) return null;
      setActiveFlockId(next.flockId);
      return next.flockId;
    },
    [triageFlockList, setActiveFlockId]
  );

  useEffect(() => {
    if (!urlFlockId) return;
    if (urlFlockId === activeFlockRef.current) return;
    activeFlockRef.current = urlFlockId;
    setActiveFlockIdState(urlFlockId);
    writeStoredActiveFlock(tenantSlug, urlFlockId);
  }, [urlFlockId, tenantSlug]);

  // After vet visit / check-in submit, advance to next overdue flock.
  useEffect(() => {
    const onVet = (e: Event) => {
      const flockId = (e as CustomEvent<{ flockId?: string }>).detail?.flockId;
      advanceToNextOverdueFlock(flockId, "vet_visit");
    };
    const onCheckin = (e: Event) => {
      const flockId = (e as CustomEvent<{ flockId?: string }>).detail?.flockId;
      advanceToNextOverdueFlock(flockId, "checkin");
    };
    window.addEventListener("farm:vet-visit-submitted", onVet);
    window.addEventListener("farm:checkin-submitted", onCheckin);
    return () => {
      window.removeEventListener("farm:vet-visit-submitted", onVet);
      window.removeEventListener("farm:checkin-submitted", onCheckin);
    };
  }, [advanceToNextOverdueFlock]);

  const value = useMemo<ActiveFlockContextValue>(
    () => ({
      activeFlockId,
      setActiveFlockId,
      clearActiveFlock,
      primaryFlockId,
      setPrimaryFlockId: setPrimaryFlockIdStable,
      triageFlockList,
      setTriageFlockList: setTriageFlockListStable,
      advanceToNextOverdueFlock,
    }),
    [
      activeFlockId,
      setActiveFlockId,
      clearActiveFlock,
      primaryFlockId,
      setPrimaryFlockIdStable,
      triageFlockList,
      setTriageFlockListStable,
      advanceToNextOverdueFlock,
    ]
  );

  return <ActiveFlockContext.Provider value={value}>{children}</ActiveFlockContext.Provider>;
}

export function useActiveFlock(): ActiveFlockContextValue {
  const ctx = useContext(ActiveFlockContext);
  if (!ctx) {
    throw new Error("useActiveFlock must be used within ActiveFlockProvider");
  }
  return ctx;
}

/** Safe optional hook for pages that may render outside provider during tests. */
export function useActiveFlockOptional(): ActiveFlockContextValue | null {
  return useContext(ActiveFlockContext);
}

export { resolveActiveFlockId, readStoredActiveFlock };
