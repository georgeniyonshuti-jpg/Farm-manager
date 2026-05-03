import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canFlockAction, flockActionPresentation } from "../../auth/permissions";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge, type CheckinBadge } from "../../components/farm/CheckinUrgencyBadge";
import { BarnNameField } from "../../components/farm/BarnNameField";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { useBarnNames } from "../../hooks/useBarnNames";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { useSuppliers } from "../../hooks/useSuppliers";

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
type BarnSummary = {
  barn: string;
  flockCount: number;
  blockedFlocks: number;
  overdueRounds: number;
  mortality7d: number;
  avgFcr: number | null;
};
type FlockRecoveryOverview = {
  failedFlocks: Array<{ id: string; label: string; status?: string; failedReason?: string; failedAt?: string }>;
  unexpectedStatusFlocks: Array<{ id: string; label: string; status?: string }>;
  orphanReferences: Array<{ source: string; count: number; sampleIds: string[] }>;
  summary?: { failedCount?: number; unexpectedStatusCount?: number; orphanReferenceCount?: number };
};

type SortCol = "risk" | "label" | "barn" | "placement";

export function FlockListPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const breedOptions = useReferenceOptions("breed", token, FALLBACK_BREED_OPTIONS);
  const { suppliers, loadSuppliers, createSupplier } = useSuppliers(token);
  const { barnNames, loadBarnNames, createBarnName } = useBarnNames(token);
  const canCreateFlock = canFlockAction(user, "flock.create");
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [barns, setBarns] = useState<BarnSummary[]>([]);
  const [riskFilter, setRiskFilter] = useState<"all" | "at_risk" | "blocked" | "needs_vet" | "needs_manager" | "overdue_checkins">("all");
  const [focusMode, setFocusMode] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [farmHealthScore, setFarmHealthScore] = useState<number | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [showCreateFlock, setShowCreateFlock] = useState(false);
  const [purgeBusyId, setPurgeBusyId] = useState<string | null>(null);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [retryBusyId, setRetryBusyId] = useState<string | null>(null);
  const [deleteFailedBusyId, setDeleteFailedBusyId] = useState<string | null>(null);
  const [recoveryOverview, setRecoveryOverview] = useState<FlockRecoveryOverview | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
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
  const placementRef = useRef<HTMLInputElement>(null);
  const initialCountRef = useRef<HTMLInputElement>(null);
  const breedRef = useRef<HTMLSelectElement>(null);
  const barnFieldRef = useRef<HTMLDivElement>(null);
  const barnSelectRef = useRef<HTMLSelectElement>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const listQ =
        user?.role === "superuser" || user?.role === "manager" || user?.role === "vet_manager"
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
        setBarns([]);
        setInsights([]);
        setFarmHealthScore(null);
        setRecoveryOverview(null);
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
      if (user?.role === "superuser") {
        setRecoveryLoading(true);
        try {
          const rr = await fetch(`${API_BASE_URL}/api/flocks/recovery-overview`, { headers: readAuthHeaders(token) });
          const rd = await rr.json().catch(() => ({}));
          if (rr.ok) {
            setRecoveryOverview({
              failedFlocks: (rd as { failedFlocks?: FlockRecoveryOverview["failedFlocks"] }).failedFlocks ?? [],
              unexpectedStatusFlocks:
                (rd as { unexpectedStatusFlocks?: FlockRecoveryOverview["unexpectedStatusFlocks"] }).unexpectedStatusFlocks ?? [],
              orphanReferences: (rd as { orphanReferences?: FlockRecoveryOverview["orphanReferences"] }).orphanReferences ?? [],
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
      } else {
        setRecoveryOverview(null);
      }
      try {
        const br = await fetch(`${API_BASE_URL}/api/farm/ops-board`, { headers: readAuthHeaders(token) });
        const bd = await br.json().catch(() => ({ barns: [], flocks: [], insights: [] }));
        if (br.ok) {
          setBarns((bd.barns as BarnSummary[]) ?? []);
          setInsights(((bd as { insights?: string[] }).insights) ?? []);
          setFarmHealthScore((bd as { farmHealthScore?: number }).farmHealthScore ?? null);
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
        } else {
          setBarns([]);
          setInsights([]);
          setFarmHealthScore(null);
        }
      } catch {
        setBarns([]);
        setInsights([]);
        setFarmHealthScore(null);
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
        ? " Biological asset opening is being posted to Odoo under IAS 41."
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
    if (!window.confirm(`Archive flock ${label}? It will be hidden from field staff selectors.`)) return;
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
    const confirmPhrase = window.prompt(`Type PURGE to permanently delete ${label}`);
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
          if (riskFilter === "at_risk") return Number(f.riskScore ?? 0) > 60;
          if (riskFilter === "needs_vet") return f.needsRole === "vet";
          if (riskFilter === "needs_manager") return f.needsRole === "vet_manager";
          if (riskFilter === "overdue_checkins") return (f.timeStatus?.overdueHours ?? 0) > 0;
          return true;
        })
        .filter((f) => (focusMode ? Number(f.riskScore ?? 0) > 60 : true)),
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
      return dir * (Number(a.riskScore ?? 0) - Number(b.riskScore ?? 0));
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Flocks"
        subtitle="Real-time flock risk prioritization with explainable alerts."
        action={
          <a
            href={`${API_BASE_URL}/api/reports/flocks.csv`}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            download
          >
            Export CSV
          </a>
        }
      />
      {syncWarning ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100" role="status">
          {syncWarning}
        </div>
      ) : null}
      {farmHealthScore != null ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 text-sm shadow-[var(--shadow-sm)]">
          <p className="font-semibold text-[var(--text-primary)]">Farm health score: {farmHealthScore}/100</p>
          {!!insights.length ? <p className="mt-1 text-[var(--text-secondary)]">{insights[0]}</p> : null}
        </div>
      ) : null}
      {user?.role === "superuser" ? (
        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 text-sm shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-[var(--text-primary)]">Data repair</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            >
              Refresh
            </button>
          </div>
          {recoveryLoading ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Loading recovery signals…</p>
          ) : recoveryOverview ? (
            <div className="mt-2 space-y-2 text-xs">
              <p className="text-[var(--text-secondary)]">
                Failed: <strong>{recoveryOverview.summary?.failedCount ?? recoveryOverview.failedFlocks.length}</strong> ·
                Unexpected statuses: <strong>{recoveryOverview.summary?.unexpectedStatusCount ?? recoveryOverview.unexpectedStatusFlocks.length}</strong> ·
                Orphan refs: <strong>{recoveryOverview.summary?.orphanReferenceCount ?? 0}</strong>
              </p>
              {recoveryOverview.orphanReferences.length > 0 ? (
                <ul className="space-y-1">
                  {recoveryOverview.orphanReferences.map((r) => (
                    <li key={r.source} className="text-amber-300">
                      {r.source}: {r.count} orphan refs {r.sampleIds.length ? `(${r.sampleIds.slice(0, 3).join(", ")})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-emerald-400">No orphan references detected.</p>
              )}
              {recoveryOverview.unexpectedStatusFlocks.length > 0 ? (
                <p className="text-amber-300">
                  Unexpected status flocks: {recoveryOverview.unexpectedStatusFlocks.slice(0, 5).map((f) => `${f.label}(${f.status})`).join(", ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Recovery overview unavailable.</p>
          )}
        </section>
      ) : null}
      {canCreateFlock ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/farm/reports?type=flock_comparison")}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            Compare flocks report
          </button>
          <button
            type="button"
            onClick={toggleCreateFlockPanel}
            className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)]"
          >
            {showCreateFlock ? "Close" : "Create new flock"}
          </button>
        </div>
      ) : null}

      {canCreateFlock && showCreateFlock ? (
        <form onSubmit={(e) => void submitCreateFlock(e)} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {editingFlockId ? "Edit flock" : "Add purchased flock"}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {editingFlockId
              ? "Update placement, counts, breed, barn, and purchase details. Flock code stays the same."
              : "The system assigns a unique flock name (e.g. FL-000042)."}
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
          <p className="text-xs text-[var(--text-muted)]">Enter total purchase cost only. Cost per chick is computed automatically and posted to Odoo.</p>
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
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]"
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
                  </button>
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
            <button
              type="submit"
              disabled={createBusy}
              className="rounded-lg bg-[var(--primary-color)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
            >
              {createBusy ? "Saving..." : editingFlockId ? "Save changes" : "Add flock"}
            </button>
          </div>
        </form>
      ) : null}

      {loading && <SkeletonList rows={4} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && flocks.length === 0 && (
        <EmptyState
          title="No flocks yet"
          description="Add your first flock to get started."
        />
      )}

      {!loading && !error && flocks.length > 0 ? (
        <>
          {!!barns.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {barns.map((b) => (
                <div key={b.barn} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)] text-xs">
                  <p className="font-semibold text-sm text-[var(--text-primary)]">{b.barn}</p>
                  <p className="text-[var(--text-muted)]">{b.flockCount} active flock(s)</p>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <span className="text-[var(--text-muted)]">Avg FCR</span>
                    <span className="font-semibold text-right tabular-nums">{b.avgFcr != null ? b.avgFcr.toFixed(2) : "—"}</span>
                    <span className="text-[var(--text-muted)]">Blocked</span>
                    <span className={["font-semibold text-right", b.blockedFlocks > 0 ? "text-red-400" : ""].join(" ")}>{b.blockedFlocks}</span>
                    <span className="text-[var(--text-muted)]">Overdue rounds</span>
                    <span className={["font-semibold text-right", b.overdueRounds > 0 ? "text-amber-400" : ""].join(" ")}>{b.overdueRounds}</span>
                    <span className="text-[var(--text-muted)]">Mortality 7d</span>
                    <span className={["font-semibold text-right", b.mortality7d > 0 ? "text-amber-400" : ""].join(" ")}>{b.mortality7d}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="table-block">
            <div className="table-toolbar">
              <button
                type="button"
                onClick={() => setFocusMode((v) => !v)}
                className={[
                  "rounded border px-2.5 py-1.5 text-xs font-semibold",
                  focusMode
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-[var(--border-color)] bg-[var(--surface-input)] text-[var(--text-secondary)]",
                ].join(" ")}
              >
                Focus Mode {focusMode ? "ON" : "OFF"}
              </button>
              {([
                ["all", "All"],
                ["at_risk", "At risk"],
                ["blocked", "Blocked"],
                ["needs_vet", "Needs vet"],
                ["needs_manager", "Needs manager"],
                ["overdue_checkins", "Overdue check-ins"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRiskFilter(id as typeof riskFilter)}
                  className={[
                    "rounded border px-2.5 py-1.5 text-xs font-semibold",
                    riskFilter === id
                      ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                      : "border-[var(--border-color)] bg-[var(--surface-input)] text-[var(--text-secondary)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">{visibleFlocks.length} flocks</span>
                <button
                  type="button"
                  onClick={() => {
                    const highest = [...visibleFlocks].sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0))[0];
                    if (highest) window.location.href = `/farm/flocks/${highest.id}`;
                  }}
                  className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  Jump to highest risk
                </button>
              </span>
            </div>

            <div className="institutional-table-wrapper">
              <table className="institutional-table flock-list-table min-w-[80rem]">
                <thead>
                  <tr>
                    <th scope="col">
                      <button
                        type="button"
                        onClick={() => toggleSort("label")}
                        className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)] hover:text-[var(--primary-color-dark)]"
                      >
                        Flock
                        {sortCol === "label" ? <span className="text-[10px] opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        onClick={() => toggleSort("barn")}
                        className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)] hover:text-[var(--primary-color-dark)]"
                      >
                        Barn
                        {sortCol === "barn" ? <span className="text-[10px] opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        onClick={() => toggleSort("placement")}
                        className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)] hover:text-[var(--primary-color-dark)]"
                      >
                        Placed
                        {sortCol === "placement" ? <span className="text-[10px] opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    </th>
                    <th className="tbl-num">Age (d)</th>
                    <th className="tbl-num">Interval (h)</th>
                    <th className="tbl-num">FCR</th>
                    <th className="tbl-num">FCR vs target</th>
                    <th className="tbl-num" scope="col">
                      <button
                        type="button"
                        onClick={() => toggleSort("risk")}
                        className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)] hover:text-[var(--primary-color-dark)]"
                      >
                        Risk score
                        {sortCol === "risk" ? <span className="text-[10px] opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    </th>
                    <th className="tbl-num">Wt (kg)</th>
                    <th className="tbl-num">Wt dev %</th>
                    <th className="tbl-num">Mort. 7d</th>
                    <th>Check-in</th>
                    <th>Flags</th>
                    <th className="tbl-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFlocks.map((f) => (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap">
                        {f.status === "failed" ? (
                          <span className="font-semibold text-red-300" title={f.failedReason ?? "Creation failed"}>
                            {f.label}
                          </span>
                        ) : (
                          <Link to={`/farm/flocks/${f.id}`} className="font-semibold text-emerald-800 hover:underline">
                            {f.label}
                          </Link>
                        )}
                      </td>
                      <td className="text-[var(--text-secondary)]" title={f.barnName ?? ""}>
                        {f.barnName ?? "—"}
                      </td>
                      <td className="text-[var(--text-muted)] tabular-nums">{f.placementDate || "—"}</td>
                      <td className="tbl-num">{f.ageDays ?? "—"}</td>
                      <td className="tbl-num">{f.intervalHours ?? "—"}</td>
                      <td className="tbl-num">{f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}</td>
                      <td className={["tbl-num", f.fcrDeviation != null && f.fcrDeviation > 0.2 ? "text-red-400 font-semibold" : ""].join(" ")}>
                        {f.fcrDeviation != null ? `${f.fcrDeviation >= 0 ? "+" : ""}${f.fcrDeviation.toFixed(2)}` : "—"}
                      </td>
                      <td className={["tbl-num font-semibold", Number(f.riskScore ?? 0) > 60 ? "text-red-400" : Number(f.riskScore ?? 0) > 30 ? "text-amber-400" : "text-emerald-400"].join(" ")}>
                        {f.riskScore ?? 0}
                      </td>
                      <td className="tbl-num">{f.latestWeightKg != null ? f.latestWeightKg.toFixed(2) : "—"}</td>
                      <td className={["tbl-num", (f.weightDeviationPct ?? 0) < -5 ? "text-red-400 font-semibold" : ""].join(" ")}>
                        {f.weightDeviationPct != null ? `${(f.weightDeviationPct >= 0 ? "+" : "")}${f.weightDeviationPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className={["tbl-num", (f.mortality7d ?? 0) > 0 ? "text-amber-400 font-semibold" : ""].join(" ")}>
                        {f.mortality7d ?? 0}
                      </td>
                      <td className="tbl-badge">
                        {f.checkinBadge ? <CheckinUrgencyBadge badge={f.checkinBadge} /> : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {f.status === "archived" ? (
                            <span className="inline-flex rounded-full border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
                              Archived
                            </span>
                          ) : null}
                          {f.status === "failed" ? (
                            <span className="inline-flex rounded-full border border-red-500/35 bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                              Failed create
                            </span>
                          ) : null}
                          {f.withdrawalActive ? <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">Withdrawal</span> : null}
                          {(f.overdueRounds ?? 0) > 0 ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Overdue ×{f.overdueRounds}</span> : null}
                          {(f.alerts?.length ?? 0) > 0 ? <span className="text-[10px] text-amber-800">{f.alerts?.[0]}</span> : null}
                          {!f.withdrawalActive && !(f.overdueRounds) && !(f.alerts?.length) && f.status !== "archived" && f.status !== "failed" ? (
                            <span className="text-[var(--text-muted)]">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="tbl-actions">
                        <div className="flex flex-wrap gap-2 justify-center">
                          {flockActionPresentation(user, "treatment.execute").mode === "enabled" ? (
                            <Link to="/farm/treatments" className="text-xs font-medium text-emerald-800 hover:underline">
                              Resolve
                            </Link>
                          ) : null}
                          {flockActionPresentation(user, "slaughter.schedule").mode === "enabled" ? (
                            <Link to="/farm/slaughter" className="text-xs font-medium text-emerald-800 hover:underline">
                              Slaughter
                            </Link>
                          ) : null}
                          {user?.role === "superuser" && f.status !== "archived" && f.status !== "failed" ? (
                            <button
                              type="button"
                              disabled={archiveBusyId === f.id}
                              onClick={() => void archiveFlock(f.id, f.label)}
                              className="rounded border border-amber-500/35 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
                            >
                              {archiveBusyId === f.id ? "…" : "Archive"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" ? (
                            <button
                              type="button"
                              disabled={purgeBusyId === f.id || f.status === "failed"}
                              onClick={() => void purgeFlock(f.id, f.label)}
                              className="rounded border border-red-500/35 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                            >
                              {purgeBusyId === f.id ? "…" : "Purge"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" && f.status === "failed" ? (
                            <button
                              type="button"
                              disabled={retryBusyId === f.id}
                              onClick={() => void retryFailedFlock(f.id, f.label)}
                              className="rounded border border-emerald-500/35 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                            >
                              {retryBusyId === f.id ? "…" : "Retry create"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" && f.status === "failed" ? (
                            <button
                              type="button"
                              disabled={deleteFailedBusyId === f.id}
                              onClick={() => void deleteFailedFlock(f.id, f.label)}
                              className="rounded border border-red-500/35 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                            >
                              {deleteFailedBusyId === f.id ? "…" : "Delete failed"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" && f.status !== "failed" && f.status !== "archived" ? (
                            <button
                              type="button"
                              className="rounded border border-[var(--border-color)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                              title="Edit flock"
                              onClick={() => openEditFlock(f)}
                            >
                              Edit
                            </button>
                          ) : null}
                          {flockActionPresentation(user, "treatment.execute").mode !== "enabled" &&
                          flockActionPresentation(user, "slaughter.schedule").mode !== "enabled" &&
                          user?.role !== "superuser" ? (
                            <span className="text-[var(--text-muted)]">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
