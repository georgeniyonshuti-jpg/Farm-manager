import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canFlockAction, flockActionPresentation, isFarmOpsLead } from "../../auth/permissions";
import type { SessionUser } from "../../auth/types";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge, type CheckinBadge } from "../../components/farm/CheckinUrgencyBadge";
import { BarnNameField } from "../../components/farm/BarnNameField";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { useBarnNames } from "../../hooks/useBarnNames";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { useSuppliers } from "../../hooks/useSuppliers";
import { FacetFilter, SegmentedControl, StatusPill, DataTable, type DataColumn, TableToolbar, ToolbarOverflow, NoticeStrip } from "../../components/ui";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { formatManagerDate } from "../../lib/formatManagerDateTime";
import { useTableQueryParams } from "../../hooks/useTableQueryParams";
import { fetchMyListings, type PipelineLot } from "../../api/pipeline.api";
import { fetchPublicQuote } from "../../api/publicMarket.api";
import { formatRwf, type FarmerQuote } from "../../lib/marketQuote";

const FALLBACK_BREED_OPTIONS = [
  { value: "generic_broiler", label: "generic_broiler" },
  { value: "cobb_500", label: "cobb_500" },
  { value: "ross_308", label: "ross_308" },
];

type FlockRow = {
  id: string;
  label: string;
  placementDate: string;
  barnName?: string | null;
  barnNameId?: string | null;
  purchaseCostRwf?: number | null;
  purchaseSupplier?: string | null;
  purchaseDate?: string | null;
  initialCount?: number;
  breedCode?: string;
  targetWeightKg?: number | null;
  status?: string;
  checkinBadge?: CheckinBadge;
  nextDueAt?: string;
  ageDays?: number;
  intervalHours?: number;
  latestFcr?: number | null;
  withdrawalActive?: boolean;
  overdueRounds?: number;
  mortality7d?: number;
  topIssue?: string;
  riskScore?: number;
  riskClass?: "healthy" | "watch" | "at_risk" | "critical";
  needsRole?: string;
  latestWeightKg?: number | null;
  expectedWeightKg?: number;
  weightDeviationPct?: number;
  mortalityRatePct?: number;
  mortality24hDeltaPct?: number;
  expectedFcrRange?: { min: number; max: number };
  fcrDeviation?: number | null;
  dataFreshnessScore?: number;
  timeStatus?: { label: string; severity: "healthy" | "warning" | "critical" | "watch"; overdueHours: number };
  trends?: { mortality: string; weight: string; fcr: string };
  alerts?: string[];
  failedReason?: string;
  projections?: {
    projectedHarvestWeightKg?: number | null;
    projectedHarvestDeltaPct?: number | null;
    projectedMortalityPct?: number;
  };
};
type SortCol = "risk" | "label" | "barn" | "placement";

export function FlockListPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { showToast } = useToast();
  const breedOptions = useReferenceOptions("breed", token, FALLBACK_BREED_OPTIONS);
  const { suppliers, loadSuppliers, createSupplier } = useSuppliers(token);
  const { barnNames, loadBarnNames, createBarnName } = useBarnNames(token);
  const canCreateFlock = canFlockAction(user, "flock.create");
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { values: flockQuery, setValue: setFlockQuery } = useTableQueryParams({
    risk: "all",
    focus: "0",
  });
  const riskFilter = flockQuery.risk as
    | "all"
    | "at_risk"
    | "blocked"
    | "needs_vet"
    | "needs_manager"
    | "overdue_checkins";
  const setRiskFilter = (v: typeof riskFilter) => setFlockQuery("risk", v);
  const focusMode = flockQuery.focus === "1";
  const setFocusMode = (v: boolean) => setFlockQuery("focus", v ? "1" : "0");
  const [createBusy, setCreateBusy] = useState(false);
  const [showCreateFlock, setShowCreateFlock] = useState(false);
  const [purgeBusyId, setPurgeBusyId] = useState<string | null>(null);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [retryBusyId, setRetryBusyId] = useState<string | null>(null);
  const [deleteFailedBusyId, setDeleteFailedBusyId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    placementDate: new Date().toISOString().slice(0, 10),
    initialCount: "",
    breedCode: "generic_broiler",
    targetWeightKg: "",
    purchaseCostRwf: "",
    supplierId: "",
    supplierMode: "existing" as "existing" | "new",
    purchaseSupplier: "",
    purchaseDate: "",
    barnNameId: "",
    barnMode: "existing" as "existing" | "new",
    newBarnName: "",
  });
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<SortCol>("risk");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingFlockId, setEditingFlockId] = useState<string | null>(null);
  const [marketLots, setMarketLots] = useState<PipelineLot[]>([]);
  const placementRef = useRef<HTMLInputElement>(null);
  const initialCountRef = useRef<HTMLInputElement>(null);
  const breedRef = useRef<HTMLSelectElement>(null);
  const barnFieldRef = useRef<HTMLDivElement>(null);
  const barnSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchMyListings(token)
      .then((r) => {
        if (!cancelled) setMarketLots(r.lots || []);
      })
      .catch(() => {
        if (!cancelled) setMarketLots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openMarketLots = useMemo(
    () =>
      marketLots.filter(
        (lot) => lot.flockId && ["draft", "open", "partial"].includes(lot.status)
      ),
    [marketLots]
  );
  const marketPending = openMarketLots.some((lot) => lot.verificationStatus === "pending_review");
  const marketNotice =
    openMarketLots.length === 0
      ? null
      : marketPending
        ? "This flock is drafted for the market — Cleva is reviewing."
        : "This flock is listed on the market.";

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const listQ =
        isFarmOpsLead(user)
          ? `?includeArchived=true${user?.role === "superuser" ? "&includeFailed=true" : ""}`
          : "";
      const r = await fetch(`${API_BASE_URL}/api/flocks${listQ}`, { headers: readAuthHeaders(token) });
      const d = (await r.json()) as {
        flocks?: FlockRow[];
        error?: string;
        code?: string;
        flockSync?: { stale?: boolean; syncError?: string | null };
      };
      if (r.status === 503) {
        setSyncWarning(null);
        setError(
          d.code === "FLOCK_CACHE_UNAVAILABLE"
            ? d.error ?? "Flock data is temporarily unavailable. Please try again in a few seconds."
            : d.error ?? "Could not load flocks."
        );
        setFlocks([]);
        return;
      }
      if (!r.ok) throw new Error(d.error ?? "Load failed");
      if (d.flockSync?.stale) {
        setSyncWarning(
          "Showing cached flock data — the latest database sync had an issue. Refresh the page or retry if something looks wrong."
        );
      } else {
        setSyncWarning(null);
      }
      const base = (d.flocks as FlockRow[]) ?? [];
      const enriched = await Promise.all(
        base.map(async (f) => {
          try {
            const er = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(f.id)}/eligibility`, {
              headers: readAuthHeaders(token),
            });
            const ed = await er.json().catch(() => ({ eligibleForSlaughter: true, blockers: [] }));
            return {
              ...f,
              latestFcr: null,
              withdrawalActive: !Boolean((ed as { eligibleForSlaughter?: boolean }).eligibleForSlaughter ?? true),
              overdueRounds: 0,
              mortality7d: 0,
              topIssue: "",
              riskScore: 0,
              needsRole: "vet",
            };
          } catch {
            return { ...f, latestFcr: null, withdrawalActive: false };
          }
        })
      );
      setFlocks(enriched);
      try {
        const br = await fetch(`${API_BASE_URL}/api/farm/ops-board`, { headers: readAuthHeaders(token) });
        const bd = await br.json().catch(() => ({ flocks: [] }));
        if (br.ok) {
          type OpsRow = {
            flockId: string;
            label?: string;
            ageDays?: number;
            latestFcr?: number | null;
            latestWeightKg?: number | null;
            expectedWeightKg?: number;
            weightDeviationPct?: number;
            mortalityRatePct?: number;
            mortality24hDeltaPct?: number;
            overdueRounds?: number;
            withdrawalBlockers?: number;
            mortality7d?: number;
            expectedFcrRange?: { min: number; max: number };
            fcrDeviation?: number | null;
            riskScore?: number;
            riskClass?: "healthy" | "watch" | "at_risk" | "critical";
            topIssue?: string;
            needsRole?: string;
            dataFreshnessScore?: number;
            timeStatus?: FlockRow["timeStatus"];
            trends?: FlockRow["trends"];
            alerts?: string[];
            projections?: FlockRow["projections"];
          };
          const boardFlocks = (((bd as { flocks?: OpsRow[] }).flocks) ?? []);
          const byFlock = new Map(boardFlocks.map((x) => [x.flockId, x]));
          setFlocks((prev) => {
            const merged = prev.map((p) => {
              const o = byFlock.get(p.id);
              if (!o) return p;
              return {
                ...p,
                label: o.label ?? p.label,
                ageDays: o.ageDays ?? p.ageDays,
                latestFcr: p.latestFcr ?? (o.latestFcr ?? null),
                latestWeightKg: o.latestWeightKg ?? null,
                expectedWeightKg: o.expectedWeightKg,
                weightDeviationPct: o.weightDeviationPct,
                mortalityRatePct: o.mortalityRatePct,
                mortality24hDeltaPct: o.mortality24hDeltaPct,
                overdueRounds: Number(o.overdueRounds ?? 0),
                mortality7d: Number(o.mortality7d ?? 0),
                withdrawalActive: Number(o.withdrawalBlockers ?? 0) > 0 || Boolean(p.withdrawalActive),
                expectedFcrRange: o.expectedFcrRange,
                fcrDeviation: o.fcrDeviation ?? null,
                riskScore: o.riskScore ?? 0,
                riskClass: o.riskClass,
                topIssue: o.topIssue ?? p.topIssue ?? "Stable",
                needsRole: o.needsRole ?? p.needsRole ?? "laborer",
                dataFreshnessScore: o.dataFreshnessScore,
                timeStatus: o.timeStatus,
                trends: o.trends,
                alerts: o.alerts ?? [],
                projections: o.projections,
              } as FlockRow;
            });
            const seen = new Set(merged.map((m) => m.id));
            for (const o of boardFlocks) {
              if (seen.has(o.flockId)) continue;
              merged.push({
                id: o.flockId,
                label: o.label ?? `Flock ${o.flockId.slice(0, 8)}`,
                placementDate: "",
                ageDays: o.ageDays,
                latestFcr: o.latestFcr ?? null,
                latestWeightKg: o.latestWeightKg ?? null,
                expectedWeightKg: o.expectedWeightKg,
                weightDeviationPct: o.weightDeviationPct,
                mortalityRatePct: o.mortalityRatePct,
                mortality24hDeltaPct: o.mortality24hDeltaPct,
                overdueRounds: Number(o.overdueRounds ?? 0),
                mortality7d: Number(o.mortality7d ?? 0),
                withdrawalActive: Number(o.withdrawalBlockers ?? 0) > 0,
                expectedFcrRange: o.expectedFcrRange,
                fcrDeviation: o.fcrDeviation ?? null,
                riskScore: o.riskScore ?? 0,
                riskClass: o.riskClass,
                topIssue: o.topIssue ?? "Stable",
                needsRole: o.needsRole ?? "laborer",
                dataFreshnessScore: o.dataFreshnessScore,
                timeStatus: o.timeStatus,
                trends: o.trends,
                alerts: o.alerts ?? [],
                projections: o.projections,
              });
            }
            return merged.sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0));
          });
        }
      } catch {
        /* ops board enrichment is optional */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);
  useEffect(() => {
    void loadBarnNames().catch(() => {});
  }, [loadBarnNames]);

  function scrollToFirstCreateError(keys: string[]) {
    const order = ["placementDate", "initialCount", "breedCode", "barn", "supplier"];
    for (const k of order) {
      if (!keys.includes(k)) continue;
      if (k === "placementDate") placementRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (k === "initialCount") initialCountRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (k === "breedCode") breedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (k === "barn") barnFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
  }

  function openEditFlock(f: FlockRow) {
    if (user?.role !== "superuser") return;
    const matchSupplier = suppliers.find((s) => s.name === (f.purchaseSupplier ?? ""));
    setCreateForm({
      placementDate: f.placementDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      initialCount: f.initialCount != null ? String(f.initialCount) : "",
      breedCode: (f.breedCode ?? "generic_broiler").trim().toLowerCase(),
      targetWeightKg: f.targetWeightKg != null && Number.isFinite(f.targetWeightKg) ? String(f.targetWeightKg) : "",
      purchaseCostRwf: f.purchaseCostRwf != null ? String(f.purchaseCostRwf) : "",
      supplierId: matchSupplier?.id ?? "",
      supplierMode: matchSupplier ? "existing" : f.purchaseSupplier ? "new" : "existing",
      purchaseSupplier: matchSupplier ? "" : (f.purchaseSupplier ?? ""),
      purchaseDate: f.purchaseDate?.slice(0, 10) ?? "",
      barnNameId: f.barnNameId ?? "",
      barnMode: f.barnNameId ? "existing" : "existing",
      newBarnName: "",
    });
    setEditingFlockId(f.id);
    setCreateFieldErrors({});
    setShowCreateFlock(true);
  }

  async function submitCreateFlock(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreateFlock) return;
    setCreateFieldErrors({});
    let barnNameId = createForm.barnNameId.trim();
    let barnMode = createForm.barnMode;
    let newBarnName = createForm.newBarnName;
    try {
      if (barnMode === "new" && newBarnName.trim()) {
        const createdBarn = await createBarnName(newBarnName);
        if (createdBarn?.id) {
          barnNameId = createdBarn.id;
          barnMode = "existing";
          newBarnName = "";
          setCreateForm((v) => ({
            ...v,
            barnMode: "existing",
            barnNameId: createdBarn.id,
            newBarnName: "",
          }));
        }
      }
    } catch (be) {
      showToast("error", be instanceof Error ? be.message : "Could not save barn name");
      setCreateFieldErrors({ barn: "Save the new barn name before continuing." });
      scrollToFirstCreateError(["barn"]);
      return;
    }

    const errs: Record<string, string> = {};
    if (!createForm.placementDate?.trim()) errs.placementDate = "Placement date is required.";
    const n = Number(createForm.initialCount);
    if (!createForm.initialCount?.trim() || !Number.isFinite(n) || n <= 0) {
      errs.initialCount = "Initial bird count is required (greater than zero).";
    }
    if (!createForm.breedCode?.trim()) errs.breedCode = "Breed is required.";
    const barnOk =
      (barnMode === "existing" && barnNameId.length > 0) || (barnMode === "new" && newBarnName.trim().length > 0);
    if (!barnOk) errs.barn = "Barn name is required.";
    if (Object.keys(errs).length) {
      setCreateFieldErrors(errs);
      scrollToFirstCreateError(Object.keys(errs));
      return;
    }

    setCreateBusy(true);
    try {
      const body = {
        placementDate: createForm.placementDate,
        initialCount: Number(createForm.initialCount),
        breedCode: createForm.breedCode.trim().toLowerCase(),
        targetWeightKg: createForm.targetWeightKg ? Number(createForm.targetWeightKg) : null,
        status: "active",
        purchaseCostRwf: createForm.purchaseCostRwf ? Number(createForm.purchaseCostRwf) : undefined,
        supplierId: createForm.supplierMode === "existing" ? (createForm.supplierId || undefined) : undefined,
        purchaseSupplier: createForm.purchaseSupplier.trim() || undefined,
        purchaseDate: createForm.purchaseDate || undefined,
        barnNameId: barnMode === "existing" ? barnNameId || undefined : undefined,
        barnName: barnMode === "new" ? newBarnName.trim() : undefined,
      };
      const isEdit = Boolean(editingFlockId) && user?.role === "superuser";
      const r = await fetch(
        isEdit ? `${API_BASE_URL}/api/flocks/${encodeURIComponent(editingFlockId!)}` : `${API_BASE_URL}/api/flocks`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(body),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = (d as { error?: string; detail?: string }).error ?? (isEdit ? "Failed to update flock" : "Failed to create flock");
        const detail = (d as { detail?: string }).detail;
        throw new Error(detail ? `${err} — ${detail}` : err);
      }
      const created = d as { flock?: { label?: string; code?: string | null } };
      const name = created.flock?.label ?? created.flock?.code ?? "Flock";
      const costMsg = createForm.purchaseCostRwf
        ? " Biological asset opening is being recorded under IAS 41 for ERPNext."
        : "";
      showToast("success", isEdit ? `Flock ${name} updated.` : `Flock ${name} added.${costMsg}`);
      setCreateForm((prev) => ({
        ...prev,
        placementDate: new Date().toISOString().slice(0, 10),
        initialCount: "",
        targetWeightKg: "",
        purchaseCostRwf: "",
        supplierId: "",
        supplierMode: "existing",
        purchaseSupplier: "",
        purchaseDate: "",
        barnNameId: "",
        barnMode: "existing",
        newBarnName: "",
      }));
      setEditingFlockId(null);
      setShowCreateFlock(false);
      await load();
    } catch (e2) {
      showToast("error", e2 instanceof Error ? e2.message : "Failed to save flock");
    } finally {
      setCreateBusy(false);
    }
  }

  async function archiveFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    if (
      !window.confirm(
        `Archive flock ${label}? It will be hidden from field staff selectors. In ERPNext the flock status becomes Completed (operational close only — does not clear Biological Assets GL).`
      )
    ) {
      return;
    }
    setArchiveBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/archive`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Archive failed");
      showToast("success", `${label} archived`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiveBusyId(null);
    }
  }

  async function purgeFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    const confirmPhrase = window.prompt(
      `Type PURGE to permanently delete ${label} from Farm Manager.\n\nERPNext will mark this flock Closed and remove it from ops lists. This does NOT clear Biological Assets GL — use slaughter, mortality, or valuation in ERPNext for accounting derecognition.`
    );
    if (confirmPhrase !== "PURGE") return;
    setPurgeBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/purge`, {
        method: "DELETE",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Purge failed");
      showToast("success", `${label} purged`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Purge failed");
    } finally {
      setPurgeBusyId(null);
    }
  }

  async function retryFailedFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    setRetryBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/retry-create`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Retry create failed");
      showToast("success", `${label} retried and recreated`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Retry create failed");
    } finally {
      setRetryBusyId(null);
    }
  }

  async function deleteFailedFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    const confirmPhrase = window.prompt(`Type DELETE FAILED to remove ${label}`);
    if (confirmPhrase !== "DELETE FAILED") return;
    setDeleteFailedBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/failed`, {
        method: "DELETE",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Delete failed flock failed");
      showToast("success", `${label} removed`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Delete failed flock failed");
    } finally {
      setDeleteFailedBusyId(null);
    }
  }

  const filteredFlocks = useMemo(
    () =>
      flocks
        .filter((f) => {
          if (riskFilter === "all") return true;
          if (riskFilter === "blocked") return Boolean(f.withdrawalActive);
          if (riskFilter === "at_risk") return effectiveRiskScore(f) > 60;
          if (riskFilter === "needs_vet") return f.needsRole === "vet";
          if (riskFilter === "needs_manager") return f.needsRole === "vet_manager";
          if (riskFilter === "overdue_checkins") return isCheckinOverdue(f);
          return true;
        })
        .filter((f) => (focusMode ? effectiveRiskScore(f) > 60 || isCheckinOverdue(f) : true)),
    [flocks, riskFilter, focusMode]
  );

  const visibleFlocks = useMemo(() => {
    const arr = [...filteredFlocks];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortCol === "label") return dir * String(a.label).localeCompare(String(b.label), undefined, { sensitivity: "base" });
      if (sortCol === "barn")
        return dir * String(a.barnName ?? "—").localeCompare(String(b.barnName ?? "—"), undefined, { sensitivity: "base" });
      if (sortCol === "placement")
        return dir * String(a.placementDate ?? "").localeCompare(String(b.placementDate ?? ""));
      return dir * (effectiveRiskScore(a) - effectiveRiskScore(b));
    });
    return arr;
  }, [filteredFlocks, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir(col === "risk" ? "desc" : "asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  function toggleCreateFlockPanel() {
    if (showCreateFlock) {
      setShowCreateFlock(false);
      setEditingFlockId(null);
      setCreateFieldErrors({});
      return;
    }
    setEditingFlockId(null);
    setCreateFieldErrors({});
    setCreateForm({
      placementDate: new Date().toISOString().slice(0, 10),
      initialCount: "",
      breedCode: "generic_broiler",
      targetWeightKg: "",
      purchaseCostRwf: "",
      supplierId: "",
      supplierMode: "existing",
      purchaseSupplier: "",
      purchaseDate: "",
      barnNameId: "",
      barnMode: "existing",
      newBarnName: "",
    });
    setShowCreateFlock(true);
  }


  const flockColumns: DataColumn<FlockRow>[] = useMemo(() => {
    return [
      {
        key: "label",
        header: "Flock",
        sortable: true,
        render: (f) => {
          return (
            <div className="flex min-w-0 items-start gap-2.5">
              <span className={`mt-1 h-9 w-1 shrink-0 rounded-full ${riskVisual(effectiveRiskScore(f)).bar}`} aria-hidden />
              <div className="min-w-0">
                {f.status === "failed" ? (
                  <span className="font-semibold text-[var(--status-danger)]" title={f.failedReason ?? "Creation failed"}>
                    {f.label}
                  </span>
                ) : (
                  <Link
                    to={companyHref(`/farm/flocks/${f.id}`)}
                    className="font-semibold text-[var(--text-primary)] hover:text-[var(--primary-color-dark)] hover:underline"
                  >
                    {f.label}
                  </Link>
                )}
                <p className="mt-0.5 type-caption text-[var(--text-muted)]">
                  {f.barnName ?? "No barn"}
                  {f.ageDays != null ? ` · ${f.ageDays}d` : ""}
                  {f.placementDate ? ` · ${formatManagerDate(f.placementDate)}` : ""}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        key: "barn",
        header: "Barn",
        sortable: true,
        defaultHidden: true,
        render: (f) => <span className="text-[var(--text-secondary)]">{f.barnName ?? "—"}</span>,
      },
      {
        key: "placement",
        header: "Placed",
        sortable: true,
        defaultHidden: true,
        render: (f) => (
          <span className="text-[var(--text-muted)] tabular-nums" title={f.placementDate || undefined}>
            {formatManagerDate(f.placementDate)}
          </span>
        ),
      },
      {
        key: "age",
        header: "Age (d)",
        numeric: true,
        defaultHidden: true,
        render: (f) => f.ageDays ?? "—",
      },
      {
        key: "interval",
        header: "Interval (h)",
        numeric: true,
        defaultHidden: true,
        render: (f) => f.intervalHours ?? "—",
      },
      {
        key: "risk",
        header: "Risk",
        sortable: true,
        badge: true,
        render: (f) => {
          const score = effectiveRiskScore(f);
          const visual = riskVisual(score);
          return (
            <StatusPill tone={visual.tone}>
              {visual.level} {score}
            </StatusPill>
          );
        },
      },
      {
        key: "mortality",
        header: "Mort 7d",
        numeric: true,
        render: (f) => (
          <span
            className={`tabular-nums ${(f.mortality7d ?? 0) > 0 ? "font-semibold text-[var(--status-warning)]" : "text-[var(--text-primary)]"}`}
          >
            {f.mortality7d ?? 0}
          </span>
        ),
      },
      {
        key: "fcr",
        header: "FCR",
        numeric: true,
        render: (f) =>
          f.latestFcr != null ? (
            <span className="tabular-nums font-medium">{f.latestFcr.toFixed(2)}</span>
          ) : (
            <span className="text-[var(--text-muted)]" title="Not weighed yet">
              —
            </span>
          ),
      },
      {
        key: "weight",
        header: "Weight",
        numeric: true,
        render: (f) =>
          f.latestWeightKg != null ? (
            <span className="tabular-nums font-medium">{f.latestWeightKg.toFixed(2)} kg</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          ),
      },
      {
        key: "birds",
        header: "Birds",
        numeric: true,
        render: (f) =>
          f.initialCount != null ? (
            <span className="tabular-nums">{f.initialCount.toLocaleString()}</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          ),
      },
      {
        key: "checkin",
        header: "Status",
        badge: true,
        render: (f) => (
          <div className="flex flex-wrap items-center gap-1">
            {f.checkinBadge ? <CheckinUrgencyBadge badge={f.checkinBadge} /> : null}
            {f.withdrawalActive ? <StatusPill tone="danger">Withdrawal</StatusPill> : null}
            {(f.overdueRounds ?? 0) > 0 ? <StatusPill tone="warning">×{f.overdueRounds}</StatusPill> : null}
            {f.status === "archived" ? <StatusPill tone="neutral">Archived</StatusPill> : null}
            {f.status === "failed" ? <StatusPill tone="danger">Failed</StatusPill> : null}
            {!f.checkinBadge &&
            !f.withdrawalActive &&
            !(f.overdueRounds ?? 0) &&
            f.status !== "archived" &&
            f.status !== "failed" ? (
              <span className="text-[var(--text-muted)]">—</span>
            ) : null}
          </div>
        ),
      },
      {
        key: "fcrDev",
        header: "FCR vs target",
        numeric: true,
        defaultHidden: true,
        render: (f) =>
          f.fcrDeviation != null ? (
            <span className={f.fcrDeviation > 0.2 ? "text-[var(--status-danger)] font-semibold" : ""}>
              {`${f.fcrDeviation >= 0 ? "+" : ""}${f.fcrDeviation.toFixed(2)}`}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">n/a</span>
          ),
      },
      {
        key: "weightDev",
        header: "Weight vs target",
        numeric: true,
        defaultHidden: true,
        render: (f) =>
          f.weightDeviationPct != null ? (
            <span className={(f.weightDeviationPct ?? 0) < -5 ? "text-[var(--status-danger)] font-semibold" : ""}>
              {`${f.weightDeviationPct >= 0 ? "+" : ""}${f.weightDeviationPct.toFixed(1)}%`}
            </span>
          ) : (
            "—"
          ),
      },
      {
        key: "issue",
        header: "Issue",
        defaultHidden: true,
        render: (f) =>
          (f.alerts?.length ?? 0) > 0 ? (
            <span className="text-[10px] text-[var(--status-warning)]">{f.alerts?.[0]}</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (f) => {
          const canResolve = flockActionPresentation(user, "treatment.execute").mode === "enabled";
          const canSlaughter = flockActionPresentation(user, "slaughter.schedule").mode === "enabled";
          const isSuper = user?.role === "superuser";
          const more: { key: string; label: string; onClick?: () => void; disabled?: boolean }[] = [];
          if (canSlaughter) {
            more.push({
              key: "slaughter",
              label: "Slaughter",
              onClick: () => navigate("/farm/slaughter"),
            });
          }
          if (isSuper && f.status !== "archived" && f.status !== "failed") {
            more.push({
              key: "archive",
              label: archiveBusyId === f.id ? "Archiving…" : "Archive",
              onClick: () => void archiveFlock(f.id, f.label),
              disabled: archiveBusyId === f.id,
            });
            more.push({
              key: "edit",
              label: "Edit",
              onClick: () => openEditFlock(f),
            });
          }
          if (isSuper) {
            more.push({
              key: "purge",
              label: purgeBusyId === f.id ? "Purging…" : "Purge",
              onClick: () => void purgeFlock(f.id, f.label),
              disabled: purgeBusyId === f.id || f.status === "failed",
            });
          }
          if (isSuper && f.status === "failed") {
            more.push({
              key: "retry",
              label: retryBusyId === f.id ? "Retrying…" : "Retry create",
              onClick: () => void retryFailedFlock(f.id, f.label),
              disabled: retryBusyId === f.id,
            });
            more.push({
              key: "delete-failed",
              label: deleteFailedBusyId === f.id ? "Deleting…" : "Delete failed",
              onClick: () => void deleteFailedFlock(f.id, f.label),
              disabled: deleteFailedBusyId === f.id,
            });
          }
          return (
            <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
              {canResolve ? (
                <Link
                  to="/farm/treatments"
                  className="text-xs font-semibold text-[var(--primary-color-dark)] hover:underline"
                >
                  Resolve
                </Link>
              ) : null}
              {f.status !== "failed" ? (
                <Link
                  to={companyHref(`/farm/flocks/${f.id}`)}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
                >
                  Open
                </Link>
              ) : null}
              {more.length > 0 ? <ToolbarOverflow label="⋯" items={more} /> : null}
            </div>
          );
        },
      },
    ];
  }, [user, navigate, companyHref, archiveBusyId, purgeBusyId, retryBusyId, deleteFailedBusyId]);

  return (
    <ManagerPage>
      <PageHeader
        title="Flocks"
        action={
          canCreateFlock ? (
            <Button size="sm" onClick={() => { if (!showCreateFlock) toggleCreateFlockPanel(); }}>
              Create flock
            </Button>
          ) : null
        }
      />
      {syncWarning ? (
        <NoticeStrip tone="warning" role="status">
          {syncWarning}
        </NoticeStrip>
      ) : null}
      <FarmOsOffer flocks={flocks} notice={marketNotice} />
      {canCreateFlock ? (
        <Modal
          open={showCreateFlock}
          title={editingFlockId ? "Edit flock" : "Add purchased flock"}
          onClose={toggleCreateFlockPanel}
          wide
        >
        <form onSubmit={(e) => void submitCreateFlock(e)}>
          <p className="text-xs text-[var(--text-muted)]">
            {editingFlockId
              ? "Update placement, counts, breed, barn, and purchase details. Flock code stays the same."
              : "The system assigns a unique flock name from placement date and sequence (e.g. FM-260529-042)."}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Placement date<span className="text-red-500"> *</span>
              </label>
              <input
                ref={placementRef}
                className={[
                  "w-full rounded-lg border bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]",
                  createFieldErrors.placementDate ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
                ].join(" ")}
                type="date"
                value={createForm.placementDate}
                onChange={(e) => setCreateForm((v) => ({ ...v, placementDate: e.target.value }))}
              />
              {createFieldErrors.placementDate ? (
                <p className="text-xs text-red-500">{createFieldErrors.placementDate}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Initial birds<span className="text-red-500"> *</span>
              </label>
              <input
                ref={initialCountRef}
                className={[
                  "w-full rounded-lg border bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]",
                  createFieldErrors.initialCount ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
                ].join(" ")}
                placeholder="Initial birds"
                inputMode="numeric"
                value={createForm.initialCount}
                onChange={(e) => setCreateForm((v) => ({ ...v, initialCount: e.target.value }))}
              />
              {createFieldErrors.initialCount ? (
                <p className="text-xs text-red-500">{createFieldErrors.initialCount}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Breed<span className="text-red-500"> *</span>
              </label>
              <select
                ref={breedRef}
                className={[
                  "w-full rounded-lg border bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]",
                  createFieldErrors.breedCode ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
                ].join(" ")}
                value={createForm.breedCode}
                onChange={(e) => setCreateForm((v) => ({ ...v, breedCode: e.target.value }))}
              >
                {breedOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {createFieldErrors.breedCode ? <p className="text-xs text-red-500">{createFieldErrors.breedCode}</p> : null}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Target kg (optional)</label>
              <input
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="Target kg (optional)"
                inputMode="decimal"
                value={createForm.targetWeightKg}
                onChange={(e) => setCreateForm((v) => ({ ...v, targetWeightKg: e.target.value }))}
              />
            </div>
            <BarnNameField
              barnNames={barnNames}
              mode={createForm.barnMode}
              selectedId={createForm.barnNameId}
              newBarnName={createForm.newBarnName}
              onModeChange={(m) => setCreateForm((v) => ({ ...v, barnMode: m }))}
              onSelectId={(id) => setCreateForm((v) => ({ ...v, barnNameId: id }))}
              onNewNameChange={(value) => setCreateForm((v) => ({ ...v, newBarnName: value }))}
              onSaveNew={async () => {
                try {
                  const created = await createBarnName(createForm.newBarnName);
                  if (created?.id) {
                    setCreateForm((v) => ({
                      ...v,
                      barnMode: "existing",
                      barnNameId: created.id,
                      newBarnName: created.name ?? v.newBarnName,
                    }));
                    showToast("success", "Barn name saved");
                  }
                } catch (err) {
                  showToast("error", err instanceof Error ? err.message : "Could not create barn name");
                }
              }}
              error={createFieldErrors.barn}
              disabled={createBusy}
              fieldRef={barnFieldRef}
              selectRef={barnSelectRef}
            />
          </div>
          <p className="mt-4 text-xs font-semibold text-[var(--text-secondary)]">Biological asset cost (IAS 41 — optional)</p>
          <p className="text-xs text-[var(--text-muted)]">Enter total purchase cost only. Cost per chick is computed automatically and synced to ERPNext.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Total purchase cost (RWF)"
              inputMode="decimal"
              value={createForm.purchaseCostRwf}
              onChange={(e) => setCreateForm((v) => ({ ...v, purchaseCostRwf: e.target.value }))}
            />
            <div className="space-y-2">
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={createForm.supplierMode === "new" ? "__new__" : createForm.supplierId}
                onChange={(e) =>
                  setCreateForm((v) => ({
                    ...v,
                    supplierMode: e.target.value === "__new__" ? "new" : "existing",
                    supplierId: e.target.value === "__new__" ? "" : e.target.value,
                  }))
                }
              >
                <option value="">Select supplier / hatchery</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="__new__">+ Add new supplier</option>
              </select>
              {createForm.supplierMode === "new" && (
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    placeholder="Supplier / hatchery"
                    value={createForm.purchaseSupplier}
                    onChange={(e) => setCreateForm((v) => ({ ...v, purchaseSupplier: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const created = await createSupplier(createForm.purchaseSupplier);
                        if (created?.id) {
                          setCreateForm((v) => ({
                            ...v,
                            supplierMode: "existing",
                            supplierId: created.id,
                            purchaseSupplier: created.name ?? v.purchaseSupplier,
                          }));
                          showToast("success", "Supplier saved");
                        }
                      } catch (e) {
                        showToast("error", e instanceof Error ? e.message : "Could not create supplier");
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              type="date"
              title="Purchase date"
              value={createForm.purchaseDate}
              onChange={(e) => setCreateForm((v) => ({ ...v, purchaseDate: e.target.value }))}
            />
          </div>
          {createForm.purchaseCostRwf && createForm.initialCount ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Estimated cost per chick:{" "}
              <strong>
                {(Number(createForm.purchaseCostRwf) / Math.max(1, Number(createForm.initialCount))).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                RWF
              </strong>
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={createBusy}
              loading={createBusy}
            >
              {createBusy ? "Saving..." : editingFlockId ? "Save changes" : "Add flock"}
            </Button>
          </div>
        </form>
        </Modal>
      ) : null}

      {loading && <SkeletonList rows={4} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && flocks.length === 0 && (
        <EmptyState
          title="No flocks yet"
          description="Add your first flock to get started."
          action={<Button variant="primary" onClick={() => setShowCreateFlock(true)}>Create first flock</Button>}
        />
      )}

      {!loading && !error && flocks.length > 0 ? (
        <div className="table-block">
          <DataTable<FlockRow>
            className="flock-list-table"
            flush
            columnPicker
            columns={flockColumns}
            rows={visibleFlocks}
            rowKey={(f) => f.id}
            sortKey={sortCol}
            sortDir={sortDir}
            onSort={(key) => toggleSort(key as SortCol)}
            isFiltered={riskFilter !== "all" || focusMode}
            emptyTitle="No flocks match"
            emptyDescription="Try clearing risk filters or focus mode."
            filteredEmptyTitle="No flocks match"
            filteredEmptyDescription="Try clearing risk filters or focus mode."
            toolbar={
              <TableToolbar
                filters={
                  <>
                    <SegmentedControl
                      size="sm"
                      value={focusMode ? "focus" : "all"}
                      onChange={(v) => setFocusMode(v === "focus")}
                      options={[
                        { value: "all", label: "All" },
                        { value: "focus", label: "Focus" },
                      ]}
                    />
                    <FacetFilter
                      label="Risk"
                      value={riskFilter}
                      onChange={(v) => setRiskFilter(v as typeof riskFilter)}
                      options={[
                        { value: "at_risk", label: "At risk" },
                        { value: "blocked", label: "Blocked" },
                        { value: "needs_vet", label: "Needs vet" },
                        { value: "needs_manager", label: "Needs manager" },
                        { value: "overdue_checkins", label: "Overdue check-ins" },
                      ]}
                    />
                  </>
                }
                meta={`${visibleFlocks.length} flock${visibleFlocks.length === 1 ? "" : "s"}`}
                actions={
                  <ToolbarOverflow
                    items={[
                      {
                        key: "highest",
                        label: "Jump to highest risk",
                        onClick: () => {
                          const highest = [...visibleFlocks].sort(
                            (a, b) => effectiveRiskScore(b) - effectiveRiskScore(a)
                          )[0];
                          if (highest) window.location.href = companyHref(`/farm/flocks/${highest.id}`);
                        },
                      },
                      {
                        key: "export",
                        label: "Export CSV",
                        href: `${API_BASE_URL}/api/reports/flocks.csv`,
                        download: true,
                      },
                      {
                        key: "compare",
                        label: "Compare flocks report",
                        onClick: () => navigate("/farm/reports?type=flock_comparison"),
                      },
                    ]}
                  />
                }
              />
            }
            renderMobileCard={(f) => (
              <FlockPassportCard
                flock={f}
                user={user}
                archiveBusyId={archiveBusyId}
                purgeBusyId={purgeBusyId}
                retryBusyId={retryBusyId}
                deleteFailedBusyId={deleteFailedBusyId}
                onArchive={() => void archiveFlock(f.id, f.label)}
                onPurge={() => void purgeFlock(f.id, f.label)}
                onRetry={() => void retryFailedFlock(f.id, f.label)}
                onDeleteFailed={() => void deleteFailedFlock(f.id, f.label)}
                onEdit={() => openEditFlock(f)}
                compact
              />
            )}
          />
        </div>
      ) : null}
    </ManagerPage>
  );
}

function riskVisual(score: number): { tone: "success" | "warning" | "danger"; level: string; bar: string; soft: string } {
  if (score > 60) {
    return {
      tone: "danger",
      level: "High",
      bar: "bg-[var(--status-danger)]",
      soft: "bg-[var(--status-danger-soft)]/55",
    };
  }
  if (score > 30) {
    return {
      tone: "warning",
      level: "Medium",
      bar: "bg-[var(--status-warning)]",
      soft: "bg-[var(--status-warning-soft)]/55",
    };
  }
  return {
    tone: "success",
    level: "Low",
    bar: "bg-[var(--status-success)]",
    soft: "bg-[var(--status-success-soft)]/45",
  };
}

/** Risk score from ops-board, bumped by check-in / withdrawal signals when board data is thin. */
function effectiveRiskScore(f: FlockRow): number {
  let score = Number(f.riskScore ?? 0);
  if (f.checkinBadge === "overdue" || (f.overdueRounds ?? 0) > 0 || (f.timeStatus?.overdueHours ?? 0) > 0) {
    score = Math.max(score, 55);
  } else if (f.checkinBadge === "upcoming") {
    score = Math.max(score, 28);
  }
  if (f.withdrawalActive) score = Math.max(score, 50);
  if ((f.mortality7d ?? 0) >= 10 || (f.mortalityRatePct ?? 0) >= 3) score = Math.max(score, 45);
  return Math.min(100, score);
}

function isCheckinOverdue(f: FlockRow): boolean {
  return f.checkinBadge === "overdue" || (f.overdueRounds ?? 0) > 0 || (f.timeStatus?.overdueHours ?? 0) > 0;
}

function flockBoardCue(f: FlockRow): string {
  if (f.status === "failed") return f.failedReason || "Create failed — retry or delete.";
  if (f.withdrawalActive) return "Withdrawal active — hold slaughter / sale.";
  if (isCheckinOverdue(f)) {
    const hours = f.timeStatus?.overdueHours;
    return hours != null && hours > 0
      ? `Check-in overdue by ${Math.round(hours)}h`
      : "Check-in overdue — send laborer now.";
  }
  if (f.checkinBadge === "upcoming") return "Check-in due within the hour.";
  if ((f.alerts?.length ?? 0) > 0) return f.alerts![0]!;
  if (f.topIssue && f.topIssue !== "Stable") return f.topIssue;
  if (f.latestWeightKg == null && f.expectedWeightKg != null) {
    return `Target ~${f.expectedWeightKg.toFixed(2)} kg — no weigh-in yet.`;
  }
  if (f.latestWeightKg == null) return "No weigh-in yet — schedule sampling.";
  if ((f.weightDeviationPct ?? 0) <= -5) {
    return `Weight ${f.weightDeviationPct!.toFixed(1)}% vs target for day ${f.ageDays ?? "—"}`;
  }
  if (f.latestFcr != null && f.expectedFcrRange?.max != null && f.latestFcr > f.expectedFcrRange.max) {
    return `FCR ${f.latestFcr.toFixed(2)} above target ceiling ${f.expectedFcrRange.max.toFixed(2)}`;
  }
  return "On track — no urgent action.";
}

function formatBirds(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function formatWeightCell(f: FlockRow): { value: string; hint?: string; warn?: boolean } {
  if (f.latestWeightKg != null) {
    const hint =
      f.weightDeviationPct != null
        ? `${f.weightDeviationPct >= 0 ? "+" : ""}${f.weightDeviationPct.toFixed(1)}% vs target`
        : f.expectedWeightKg != null
          ? `target ${f.expectedWeightKg.toFixed(2)} kg`
          : undefined;
    return {
      value: `${f.latestWeightKg.toFixed(2)} kg`,
      hint,
      warn: (f.weightDeviationPct ?? 0) <= -5,
    };
  }
  if (f.expectedWeightKg != null) {
    return { value: "—", hint: `target ${f.expectedWeightKg.toFixed(2)} kg`, warn: true };
  }
  return { value: "—", hint: "not weighed" };
}

function formatMortCell(f: FlockRow): { value: string; hint?: string; warn?: boolean } {
  if (f.mortalityRatePct != null && Number.isFinite(f.mortalityRatePct)) {
    return {
      value: `${f.mortalityRatePct.toFixed(1)}%`,
      hint: (f.mortality7d ?? 0) > 0 ? `${f.mortality7d} in 7d` : "cycle",
      warn: f.mortalityRatePct >= 3 || (f.mortality7d ?? 0) > 0,
    };
  }
  const n = f.mortality7d ?? 0;
  return {
    value: String(n),
    hint: "last 7d",
    warn: n > 0,
  };
}

function FlockPassportCard({
  flock: f,
  user,
  archiveBusyId,
  purgeBusyId,
  retryBusyId,
  deleteFailedBusyId,
  onArchive,
  onPurge,
  onRetry,
  onDeleteFailed,
  onEdit,
  compact = false,
}: {
  flock: FlockRow;
  user: SessionUser | null;
  archiveBusyId: string | null;
  purgeBusyId: string | null;
  retryBusyId: string | null;
  deleteFailedBusyId: string | null;
  onArchive: () => void;
  onPurge: () => void;
  onRetry: () => void;
  onDeleteFailed: () => void;
  onEdit: () => void;
  compact?: boolean;
}) {
  const { companyHref } = useCompanyNav();
  const score = effectiveRiskScore(f);
  const visual = riskVisual(score);
  const detailTo = f.status === "failed" ? undefined : companyHref(`/farm/flocks/${f.id}`);
  const canResolve = flockActionPresentation(user, "treatment.execute").mode === "enabled";
  const canSlaughter = flockActionPresentation(user, "slaughter.schedule").mode === "enabled";
  const isSuper = user?.role === "superuser";
  const weight = formatWeightCell(f);
  const mort = formatMortCell(f);
  const cue = flockBoardCue(f);
  const showRiskScore = Number(f.riskScore ?? 0) > 0 || score > 30;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate font-semibold text-[var(--text-primary)] ${compact ? "text-sm" : "text-base"}`}>
            {f.label}
          </p>
          <p className="mt-0.5 type-caption text-[var(--text-muted)]">
            {f.barnName ?? "No barn"}
            {f.placementDate ? ` · placed ${formatManagerDate(f.placementDate)}` : ""}
          </p>
        </div>
        {f.checkinBadge ? (
          <CheckinUrgencyBadge badge={f.checkinBadge} />
        ) : showRiskScore ? (
          <StatusPill tone={visual.tone}>
            {visual.level} {score}
          </StatusPill>
        ) : (
          <StatusPill tone="success">On track</StatusPill>
        )}
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-4"}`}>
        <div className="rounded-lg bg-[var(--surface-card)]/70 px-2.5 py-2">
          <p className="type-caption text-[var(--text-muted)]">Day</p>
          <p className="font-semibold tabular-nums text-[var(--text-primary)]">{f.ageDays ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-[var(--surface-card)]/70 px-2.5 py-2">
          <p className="type-caption text-[var(--text-muted)]">Birds</p>
          <p className="font-semibold tabular-nums text-[var(--text-primary)]">{formatBirds(f.initialCount)}</p>
        </div>
        {!compact ? (
          <div className="rounded-lg bg-[var(--surface-card)]/70 px-2.5 py-2">
            <p className="type-caption text-[var(--text-muted)]">Weight</p>
            <p className={`font-semibold tabular-nums ${weight.warn ? "text-[var(--status-warning)]" : "text-[var(--text-primary)]"}`}>
              {weight.value}
            </p>
            {weight.hint ? <p className="type-caption text-[var(--text-muted)]">{weight.hint}</p> : null}
          </div>
        ) : null}
        <div className="rounded-lg bg-[var(--surface-card)]/70 px-2.5 py-2">
          <p className="type-caption text-[var(--text-muted)]">Mort</p>
          <p className={`font-semibold tabular-nums ${mort.warn ? "text-[var(--status-warning)]" : "text-[var(--text-primary)]"}`}>
            {mort.value}
          </p>
          {mort.hint ? <p className="type-caption text-[var(--text-muted)]">{mort.hint}</p> : null}
        </div>
      </div>

      <p
        className={[
          "mt-3 text-xs font-medium",
          isCheckinOverdue(f) || f.withdrawalActive || score > 60
            ? "text-[var(--status-danger)]"
            : score > 30 || weight.warn || mort.warn
              ? "text-[var(--status-warning)]"
              : "text-[var(--text-secondary)]",
        ].join(" ")}
      >
        {cue}
      </p>

      {(f.withdrawalActive || (f.latestFcr != null && !compact)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {f.withdrawalActive ? <StatusPill tone="danger">Withdrawal</StatusPill> : null}
          {f.latestFcr != null ? (
            <StatusPill tone={f.fcrDeviation != null && f.fcrDeviation > 0.2 ? "warning" : "neutral"}>
              FCR {f.latestFcr.toFixed(2)}
            </StatusPill>
          ) : null}
          {f.status === "archived" ? <StatusPill tone="neutral">Archived</StatusPill> : null}
          {f.status === "failed" ? <StatusPill tone="danger">Failed create</StatusPill> : null}
        </div>
      )}
    </>
  );

  const more: { key: string; label: string; onClick?: () => void; href?: string; disabled?: boolean }[] = [];
  if (canSlaughter) more.push({ key: "slaughter", label: "Slaughter", href: companyHref("/farm/slaughter") });
  if (isSuper && f.status !== "archived" && f.status !== "failed") {
    more.push({
      key: "archive",
      label: archiveBusyId === f.id ? "Archiving…" : "Archive",
      onClick: onArchive,
      disabled: archiveBusyId === f.id,
    });
    more.push({ key: "edit", label: "Edit", onClick: onEdit });
  }
  if (isSuper) {
    more.push({
      key: "purge",
      label: purgeBusyId === f.id ? "Purging…" : "Purge",
      onClick: onPurge,
      disabled: purgeBusyId === f.id || f.status === "failed",
    });
  }
  if (isSuper && f.status === "failed") {
    more.push({
      key: "retry",
      label: retryBusyId === f.id ? "Retrying…" : "Retry create",
      onClick: onRetry,
      disabled: retryBusyId === f.id,
    });
    more.push({
      key: "delete-failed",
      label: deleteFailedBusyId === f.id ? "Deleting…" : "Delete failed",
      onClick: onDeleteFailed,
      disabled: deleteFailedBusyId === f.id,
    });
  }

  return (
    <article
      className={[
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-color)] shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
        visual.soft,
        compact ? "p-3" : "p-card",
      ].join(" ")}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${visual.bar}`} aria-hidden />
      <div className="pl-2">
        {detailTo ? (
          <Link to={detailTo} className="block focus:outline-none">
            {body}
          </Link>
        ) : (
          body
        )}

        <div
          className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-color)]/50 pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {canResolve ? (
            <Link to={companyHref("/farm/treatments")}>
              <Button size="xs" variant="secondary">
                Resolve
              </Button>
            </Link>
          ) : null}
          {detailTo ? (
            <Link to={detailTo}>
              <Button size="xs" variant="ghost">
                Open
              </Button>
            </Link>
          ) : null}
          {more.length > 0 ? <ToolbarOverflow label="⋯" items={more} className="ml-auto" /> : null}
        </div>
      </div>
    </article>
  );
}

function FarmOsOffer({ flocks, notice }: { flocks: FlockRow[]; notice: string | null }) {
  const { companyHref } = useCompanyNav();
  const [quote, setQuote] = useState<FarmerQuote | null>(null);
  const ready = flocks.find(
    (f) =>
      f.status !== "archived" &&
      (Number(f.latestWeightKg) > 0 || Number(f.expectedWeightKg) > 0) &&
      Number(f.initialCount) > 0
  );
  const birds = Number(ready?.initialCount) || 0;
  const avgKg = Number(ready?.latestWeightKg || ready?.expectedWeightKg) || 0;

  useEffect(() => {
    if (!(birds > 0) || !(avgKg > 0)) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    void fetchPublicQuote({ birds, avgKg })
      .then((r) => {
        if (!cancelled) setQuote(r.quote);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [birds, avgKg]);

  if (!quote && !notice) return null;

  return (
    <NoticeStrip
      tone="info"
      action={
        quote ? (
          <Link
            to={companyHref("/market/listings")}
            className="text-xs font-semibold text-[var(--primary-color-dark)] hover:underline"
          >
            Listings
          </Link>
        ) : null
      }
    >
      {quote
        ? `Market quote · ${formatRwf(quote.farmer.youReceiveRwf)} for ${quote.birds} birds @ ${quote.avgKg.toFixed(1)} kg (until ${quote.validTo})`
        : notice}
    </NoticeStrip>
  );
}
