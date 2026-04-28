import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { flockActionPresentation } from "../../auth/permissions";
import { readAuthHeaders, jsonAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useBarns } from "../../hooks/useBarns";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import type { CheckinStatus } from "./checkinStatusTypes";

const FALLBACK_BREED_OPTIONS = [
  { value: "generic_broiler", label: "generic_broiler" },
];

type Eligibility = {
  eligibleForSlaughter: boolean;
  blockers: Array<{ type: string; medicineName?: string; safeAfter?: string; plannedFor?: string }>;
};
type WeighIn = {
  id: string;
  weighDate: string;
  avgWeightKg: number;
  fcr: number | null;
  feedPerKgSampleBiomass?: number | null;
  variancePct: number | null;
};

type FcrBroiler = {
  fcrCumulative: number | null;
  fcrTargetMin: number;
  fcrTargetMax: number;
  status: string;
};

type Performance = {
  feedToDateKg: number;
  fcr: number | null;
  ageDays?: number;
  birdsLiveEstimate: number;
  computedBirdsLiveEstimate?: number;
  verifiedLiveCount?: number | null;
  fcrBroiler?: FcrBroiler;
  fcrSampleBiomassRatio?: number | null;
  fcrSlaughter?: number | null;
};

type FlockPickerRow = { id: string; label: string };

type FlockDetailFromApi = {
  id: string;
  label: string;
  placementDate: string;
  barnId?: string | null;
  barnName?: string | null;
  breedCode?: string;
  initialCount?: number;
  targetWeightKg?: number | null;
  purchaseCostRwf?: number | null;
  costPerChickRwf?: number | null;
  purchaseSupplier?: string | null;
  purchaseDate?: string | null;
};

export function FlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const breedOptions = useReferenceOptions("breed", token, FALLBACK_BREED_OPTIONS);
  const { suppliers, loadSuppliers } = useSuppliers(token);
  const { barns: farmBarns, loadBarns, createBarn } = useBarns(token);
  const [flockPickerOptions, setFlockPickerOptions] = useState<FlockPickerRow[]>([]);
  const [flockMeta, setFlockMeta] = useState<{ label: string; placementDate: string } | null>(null);
  const [flockDetail, setFlockDetail] = useState<FlockDetailFromApi | null>(null);
  const [showSuperEdit, setShowSuperEdit] = useState(false);
  const [superEditBusy, setSuperEditBusy] = useState(false);
  const [superEditForm, setSuperEditForm] = useState({
    placementDate: "",
    initialCount: "",
    breedCode: "generic_broiler",
    targetWeightKg: "",
    purchaseCostRwf: "",
    supplierId: "",
    supplierMode: "existing" as "existing" | "new",
    purchaseSupplier: "",
    purchaseDate: "",
    barnId: "",
    barnMode: "existing" as "existing" | "new",
    newBarnName: "",
  });
  const [superEditClearBarn, setSuperEditClearBarn] = useState(false);

  function openSuperuserEditPanel() {
    if (!flockDetail) return;
    const ps = flockDetail.purchaseSupplier?.trim();
    const matchSid = suppliers.find((s) => s.name === ps)?.id ?? "";
    setSuperEditClearBarn(false);
    setSuperEditForm({
      placementDate: flockDetail.placementDate?.slice(0, 10) ?? "",
      initialCount: String(flockDetail.initialCount ?? ""),
      breedCode: flockDetail.breedCode ?? "generic_broiler",
      targetWeightKg: flockDetail.targetWeightKg != null ? String(flockDetail.targetWeightKg) : "",
      purchaseCostRwf:
        flockDetail.purchaseCostRwf != null ? String(flockDetail.purchaseCostRwf) : "",
      supplierId: matchSid,
      supplierMode: matchSid ? "existing" : ps ? "new" : "existing",
      purchaseSupplier: ps ?? "",
      purchaseDate: flockDetail.purchaseDate?.slice(0, 10) ?? "",
      barnId: flockDetail.barnId ?? "",
      barnMode: flockDetail.barnId ? "existing" : "existing",
      newBarnName: "",
    });
    setShowSuperEdit(true);
  }

  async function submitSuperuserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || user?.role !== "superuser") return;
    setSuperEditBusy(true);
    try {
      const body: Record<string, unknown> = {
        placementDate: superEditForm.placementDate,
        initialCount: Number(superEditForm.initialCount),
        breedCode: superEditForm.breedCode.trim().toLowerCase(),
        targetWeightKg: superEditForm.targetWeightKg ? Number(superEditForm.targetWeightKg) : null,
        purchaseCostRwf: superEditForm.purchaseCostRwf ? Number(superEditForm.purchaseCostRwf) : null,
        supplierId: superEditForm.supplierMode === "existing" ? superEditForm.supplierId || undefined : undefined,
        purchaseSupplier:
          superEditForm.supplierMode === "new"
            ? superEditForm.purchaseSupplier.trim() || undefined
            : undefined,
        purchaseDate: superEditForm.purchaseDate || undefined,
      };
      if (superEditClearBarn) {
        body.clearBarn = true;
        body.barnId = null;
      } else if (superEditForm.barnMode === "existing" && superEditForm.barnId) {
        body.barnId = superEditForm.barnId;
      } else if (superEditForm.barnMode === "new" && superEditForm.newBarnName.trim()) {
        body.barnName = superEditForm.newBarnName.trim();
      }
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", "Flock details updated.");
      setShowSuperEdit(false);
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Update failed");
    } finally {
      setSuperEditBusy(false);
    }
  }
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);

  const [weighBusy, setWeighBusy] = useState(false);
  const [showWeighInForm, setShowWeighInForm] = useState(false);
  const [weighForm, setWeighForm] = useState({
    weighDate: new Date().toISOString().slice(0, 10),
    ageDays: "",
    sampleSize: "30",
    avgWeightKg: "",
    totalFeedUsedKg: "",
    targetWeightKg: "",
    notes: "",
  });

  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ liveCount: "", note: "" });

  const treatmentAction = flockActionPresentation(user, "treatment.execute");
  const weighinAction = flockActionPresentation(user, "weighin.record");
  const slaughterAction = flockActionPresentation(user, "slaughter.schedule");
  const alertAction = flockActionPresentation(user, "alert.acknowledge", { allowDisabledContext: true });

  const canVerifyHeadcount = user?.role === "manager" || user?.role === "superuser";

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const listQ =
        user?.role === "superuser" || user?.role === "manager" || user?.role === "vet_manager"
          ? "?includeArchived=true"
          : "";
      const fr = await fetch(`${API_BASE_URL}/api/flocks${listQ}`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error((fd as { error?: string }).error);
      const list = (fd.flocks as FlockDetailFromApi[]) ?? [];
      setFlockPickerOptions(list.map((row) => ({ id: row.id, label: row.label })));
      const f = list.find((x) => x.id === id);
      if (!f) throw new Error("Flock not found");
      setFlockMeta({ label: f.label, placementDate: f.placementDate });
      setFlockDetail(f);

      const sr = await fetch(`${API_BASE_URL}/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error((sd as { error?: string }).error);
      setStatus(sd as CheckinStatus);
      const pr = await fetch(`${API_BASE_URL}/api/flocks/${id}/performance-summary`, { headers: readAuthHeaders(token) });
      const pd = await pr.json();
      if (!pr.ok) throw new Error((pd as { error?: string }).error);
      setPerformance(pd as Performance);
      const [er, wr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${id}/eligibility`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/weigh-ins/${id}`, { headers: readAuthHeaders(token) }),
      ]);
      const ed = await er.json().catch(() => ({ eligibleForSlaughter: true, blockers: [] }));
      const wd = await wr.json().catch(() => ({ weighIns: [] }));
      setEligibility(ed as Eligibility);
      setWeighIns(((wd as { weighIns?: WeighIn[] }).weighIns ?? []).slice(-8).reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id, token, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSuppliers();
    void loadBarns();
  }, [loadSuppliers, loadBarns]);

  useEffect(() => {
    if (status) {
      setWeighForm((prev) => ({ ...prev, ageDays: String(status.ageDays) }));
    }
  }, [status]);

  async function submitWeighIn(e: React.FormEvent) {
    e.preventDefault();
    if (!id || weighinAction.mode !== "enabled") return;
    const sampleSize = Math.max(1, Math.floor(Number(weighForm.sampleSize)));
    const avgWeightKg = Number(weighForm.avgWeightKg);
    const totalFeedUsedKg = Number(weighForm.totalFeedUsedKg);
    const ageDays = Math.max(0, Math.floor(Number(weighForm.ageDays)));
    const td =
      typeof weighForm.targetWeightKg === "string" && weighForm.targetWeightKg.trim() !== ""
        ? Number(weighForm.targetWeightKg)
        : null;
    if (!Number.isFinite(avgWeightKg) || avgWeightKg <= 0) {
      showToast("error", "Enter average weight (kg) greater than zero.");
      return;
    }
    if (!Number.isFinite(totalFeedUsedKg) || totalFeedUsedKg < 0) {
      showToast("error", "Enter total feed used (kg) for this measurement window (0 or more).");
      return;
    }
    if (!Number.isFinite(ageDays)) {
      showToast("error", "Enter flock age in days.");
      return;
    }
    setWeighBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/weigh-ins/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          weighDate: weighForm.weighDate,
          ageDays,
          sampleSize,
          avgWeightKg,
          totalFeedUsedKg,
          targetWeightKg: td != null && Number.isFinite(td) && td > 0 ? td : undefined,
          notes: weighForm.notes.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      showToast(
        "success",
        "Weigh-in saved. Cycle FCR on the dashboard uses this weight with check-in feed totals.",
      );
      setWeighForm((v) => ({
        ...v,
        avgWeightKg: "",
        totalFeedUsedKg: "",
        targetWeightKg: "",
        notes: "",
      }));
      setShowWeighInForm(false);
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setWeighBusy(false);
    }
  }

  async function submitVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !canVerifyHeadcount) return;
    const n = Math.floor(Number(verifyForm.liveCount));
    if (!Number.isFinite(n) || n < 0) {
      showToast("error", "Enter a non-negative head count.");
      return;
    }
    setVerifyBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(id)}/live-verification`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          liveCount: n,
          note: verifyForm.note.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", "Verified head count saved.");
      setVerifyForm({ liveCount: "", note: "" });
      const perf = (d as { performance?: Performance }).performance;
      if (perf) setPerformance(perf);
      else await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Update failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function clearVerification() {
    if (!id || !canVerifyHeadcount) return;
    setVerifyBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(id)}/live-verification`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ clear: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Clear failed");
      showToast("success", "Reverted to calculated live estimate.");
      setVerifyForm({ liveCount: "", note: "" });
      const perf = (d as { performance?: Performance }).performance;
      if (perf) setPerformance(perf);
      else await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Clear failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={flockMeta?.label ?? "Flock"}
        subtitle={
          flockMeta ? (
            <>
              Placement {flockMeta.placementDate}
              {flockDetail?.barnName ? (
                <span className="text-neutral-600"> · Barn: {flockDetail.barnName}</span>
              ) : (
                <span className="text-neutral-500"> · Barn: —</span>
              )}
            </>
          ) : undefined
        }
        action={
          <div className="flex items-center gap-3">
            <Link to={`/farm/reports?type=flock_deep_dive&flockId=${encodeURIComponent(id ?? "")}`} className="text-sm font-medium text-[var(--primary-color)] hover:underline">
              Generate report
            </Link>
            <Link to="/farm/flocks" className="text-sm font-medium text-emerald-800 hover:underline">
              ← All flocks
            </Link>
          </div>
        }
      />

      {!loading && flockPickerOptions.length > 0 && id ? (
        <label className="block text-sm font-medium text-neutral-700">
          Flock
          <select
            className="mt-1 w-full min-h-[48px] max-w-xl rounded-xl border border-neutral-300 px-3 text-base"
            value={id}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              const hash = location.hash ?? "";
              void navigate(`/farm/flocks/${encodeURIComponent(next)}${hash}`);
            }}
          >
            {flockPickerOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {loading && <SkeletonList rows={3} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {flockMeta && status && !loading && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {flockDetail ? (
              <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500">Flock profile</p>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-neutral-500">Barn</dt>
                        <dd className="font-medium text-neutral-900">{flockDetail.barnName ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Breed</dt>
                        <dd className="font-medium text-neutral-900">{flockDetail.breedCode ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Initial birds</dt>
                        <dd className="font-medium text-neutral-900">{flockDetail.initialCount ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Purchase supplier</dt>
                        <dd className="font-medium text-neutral-900">{flockDetail.purchaseSupplier ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                  {user?.role === "superuser" ? (
                    <button
                      type="button"
                      onClick={() => openSuperuserEditPanel()}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                    >
                      Edit flock info
                    </button>
                  ) : null}
                </div>
                {showSuperEdit && user?.role === "superuser" ? (
                  <form onSubmit={(ev) => void submitSuperuserEdit(ev)} className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Placement date</span>
                        <input
                          type="date"
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          value={superEditForm.placementDate}
                          onChange={(e) => setSuperEditForm((v) => ({ ...v, placementDate: e.target.value }))}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Initial birds</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="numeric"
                          value={superEditForm.initialCount}
                          onChange={(e) => setSuperEditForm((v) => ({ ...v, initialCount: e.target.value }))}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Breed</span>
                        <select
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          value={superEditForm.breedCode}
                          onChange={(e) => setSuperEditForm((v) => ({ ...v, breedCode: e.target.value }))}
                        >
                          {breedOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Target weight (kg, optional)</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="decimal"
                          value={superEditForm.targetWeightKg}
                          onChange={(e) => setSuperEditForm((v) => ({ ...v, targetWeightKg: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Total purchase cost (RWF)</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="decimal"
                          value={superEditForm.purchaseCostRwf}
                          onChange={(e) => setSuperEditForm((v) => ({ ...v, purchaseCostRwf: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Purchase date</span>
                        <input
                          type="date"
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          value={superEditForm.purchaseDate}
                          onChange={(e) => setSuperEditForm((v) => ({ ...v, purchaseDate: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        className="rounded-lg border border-neutral-300 px-3 py-2"
                        value={
                          superEditForm.supplierMode === "new"
                            ? "__new__"
                            : superEditForm.supplierId
                        }
                        onChange={(e) =>
                          setSuperEditForm((v) => ({
                            ...v,
                            supplierMode: e.target.value === "__new__" ? "new" : "existing",
                            supplierId: e.target.value === "__new__" ? "" : e.target.value,
                          }))
                        }
                      >
                        <option value="">Supplier / hatchery</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value="__new__">+ Add new supplier</option>
                      </select>
                      {superEditForm.supplierMode === "new" ? (
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          placeholder="New supplier name"
                          value={superEditForm.purchaseSupplier}
                          onChange={(e) =>
                            setSuperEditForm((v) => ({ ...v, purchaseSupplier: e.target.value }))
                          }
                        />
                      ) : null}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-neutral-600">
                      <input
                        type="checkbox"
                        checked={superEditClearBarn}
                        onChange={(e) => setSuperEditClearBarn(e.target.checked)}
                      />
                      No barn assignment
                    </label>
                    {!superEditClearBarn ? (
                      <div className="space-y-2">
                        <select
                          className="w-full max-w-xl rounded-lg border border-neutral-300 px-3 py-2"
                          value={
                            superEditForm.barnMode === "new" ? "__new_barn__" : superEditForm.barnId
                          }
                          onChange={(e) =>
                            setSuperEditForm((v) => ({
                              ...v,
                              barnMode: e.target.value === "__new_barn__" ? "new" : "existing",
                              barnId: e.target.value === "__new_barn__" ? "" : e.target.value,
                            }))
                          }
                        >
                          <option value="">Select barn</option>
                          {farmBarns.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                          <option value="__new_barn__">+ Add new barn</option>
                        </select>
                        {superEditForm.barnMode === "new" ? (
                          <div className="flex flex-wrap gap-2">
                            <input
                              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2"
                              placeholder="Barn name"
                              value={superEditForm.newBarnName}
                              onChange={(e) =>
                                setSuperEditForm((v) => ({ ...v, newBarnName: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold"
                              onClick={async () => {
                                try {
                                  const created = await createBarn(superEditForm.newBarnName);
                                  if (created?.id) {
                                    setSuperEditForm((v) => ({
                                      ...v,
                                      barnMode: "existing",
                                      barnId: created.id,
                                      newBarnName: created.name ?? v.newBarnName,
                                    }));
                                    showToast("success", "Barn saved");
                                  }
                                } catch (err) {
                                  showToast("error", err instanceof Error ? err.message : "Could not save barn");
                                }
                              }}
                            >
                              Save barn
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={superEditBusy}
                        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {superEditBusy ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSuperEdit(false)}
                        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
            ) : null}
            {performance ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                  <p className="text-neutral-500">Feed to date</p>
                  <p className="font-semibold">{performance.feedToDateKg} kg</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                  <p className="text-neutral-500">Live estimate</p>
                  <p className="font-semibold">{performance.birdsLiveEstimate}</p>
                  {performance.verifiedLiveCount != null ? (
                    <p className="mt-1 text-xs text-emerald-700">Manager-verified count</p>
                  ) : performance.computedBirdsLiveEstimate != null &&
                    performance.computedBirdsLiveEstimate !== performance.birdsLiveEstimate ? null : (
                    <p className="mt-1 text-xs text-neutral-500">From placement − mortality − harvest</p>
                  )}
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                  <p className="text-neutral-500">Cycle FCR</p>
                  <p className="font-semibold">{performance.fcr != null ? performance.fcr.toFixed(2) : "-"}</p>
                  {performance.fcrBroiler?.fcrCumulative != null ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      Feed ÷ flock weight gained (broiler). Target band day {performance.ageDays ?? "?"}:{" "}
                      {performance.fcrBroiler.fcrTargetMin.toFixed(2)}–{performance.fcrBroiler.fcrTargetMax.toFixed(2)}
                    </p>
                  ) : performance.fcrSlaughter != null ? (
                    <p className="mt-1 text-xs text-neutral-500">From last harvest weights (no cycle estimate yet)</p>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-500">Add a weigh-in to compute cycle FCR</p>
                  )}
                  {id ? (
                    <Link
                      to={`/farm/flocks/${id}/fcr`}
                      className="mt-2 inline-block text-xs font-medium text-emerald-800 hover:underline"
                    >
                      Open FCR action center
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {weighinAction.mode === "enabled" ? (
              <section id="weigh-in" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm scroll-mt-4">
                <p className="mb-2 font-semibold text-neutral-800">Weigh-in history</p>
                <p className="mb-3 text-xs text-neutral-600">
                  Feed per kg of sampled biomass is shown for each entry. Use{" "}
                  <span className="font-medium text-neutral-800">Record new weigh-in</span> to add a row.
                </p>
                {weighIns.length ? (
                  <div className="mb-4 space-y-1">
                    {weighIns.map((w) => {
                      const ratio = w.feedPerKgSampleBiomass ?? w.fcr;
                      return (
                        <div key={w.id} className="grid grid-cols-4 gap-2 text-xs">
                          <span className="font-medium text-neutral-800">{w.weighDate}</span>
                          <span className="text-neutral-700">{w.avgWeightKg.toFixed(2)} kg</span>
                          <span className="text-neutral-700" title="Feed per kg of sampled bird biomass (not cumulative FCR)">
                            {ratio != null ? `${ratio.toFixed(2)} feed/kg sample` : "—"}
                          </span>
                          <span className="text-neutral-600">{w.variancePct != null ? `${w.variancePct > 0 ? "+" : ""}${w.variancePct}%` : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mb-4 text-neutral-500">No weigh-ins yet.</p>
                )}
                {!showWeighInForm ? (
                  <button
                    type="button"
                    onClick={() => setShowWeighInForm(true)}
                    className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
                  >
                    Record new weigh-in
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowWeighInForm(false)}
                      className="mb-3 text-sm font-medium text-neutral-600 underline"
                    >
                      Cancel
                    </button>
                    <p className="mb-3 font-semibold text-neutral-800">Record weigh-in</p>
                    <p className="mb-3 text-xs text-neutral-600">
                      Sample average weight and cumulative feed (kg) to this date. Cycle FCR on the dashboard uses check-in
                      feed totals and this weight × live headcount vs placement weight.
                    </p>
                    <form onSubmit={(ev) => void submitWeighIn(ev)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Weigh date</span>
                        <input
                          type="date"
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          value={weighForm.weighDate}
                          onChange={(e) => setWeighForm((v) => ({ ...v, weighDate: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Age (days)</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="numeric"
                          value={weighForm.ageDays}
                          onChange={(e) => setWeighForm((v) => ({ ...v, ageDays: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Sample size (birds)</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="numeric"
                          value={weighForm.sampleSize}
                          onChange={(e) => setWeighForm((v) => ({ ...v, sampleSize: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Avg weight (kg)</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="decimal"
                          value={weighForm.avgWeightKg}
                          onChange={(e) => setWeighForm((v) => ({ ...v, avgWeightKg: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
                        <span className="text-xs text-neutral-500">Total feed used (kg) to this date</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="decimal"
                          value={weighForm.totalFeedUsedKg}
                          onChange={(e) => setWeighForm((v) => ({ ...v, totalFeedUsedKg: e.target.value }))}
                          placeholder="Typically matches feed-to-date from check-ins"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Target weight (kg, optional)</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          inputMode="decimal"
                          value={weighForm.targetWeightKg}
                          onChange={(e) => setWeighForm((v) => ({ ...v, targetWeightKg: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs text-neutral-500">Notes</span>
                        <input
                          className="rounded-lg border border-neutral-300 px-3 py-2"
                          value={weighForm.notes}
                          onChange={(e) => setWeighForm((v) => ({ ...v, notes: e.target.value }))}
                        />
                      </label>
                      <div className="flex items-end sm:col-span-2 lg:col-span-3">
                        <button
                          type="submit"
                          disabled={weighBusy}
                          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {weighBusy ? "Saving…" : "Save weigh-in"}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </section>
            ) : null}

            {canVerifyHeadcount ? (
              <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
                <p className="mb-2 font-semibold text-neutral-800">Verified head count (manager)</p>
                <p className="mb-3 text-xs text-neutral-600">
                  Use when on-farm inventory does not match recorded mortality (e.g. unlogged losses). This overrides the
                  calculated live estimate until cleared.
                  {performance?.computedBirdsLiveEstimate != null ? (
                    <>
                      {" "}
                      Calculated now: <span className="font-medium">{performance.computedBirdsLiveEstimate}</span> birds.
                    </>
                  ) : null}
                </p>
                <form onSubmit={(ev) => void submitVerification(ev)} className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-500">Current birds (physical count)</span>
                    <input
                      className="rounded-lg border border-neutral-300 px-3 py-2"
                      inputMode="numeric"
                      value={verifyForm.liveCount}
                      onChange={(e) => setVerifyForm((v) => ({ ...v, liveCount: e.target.value }))}
                    />
                  </label>
                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                    <span className="text-xs text-neutral-500">Note (optional)</span>
                    <input
                      className="rounded-lg border border-neutral-300 px-3 py-2"
                      value={verifyForm.note}
                      onChange={(e) => setVerifyForm((v) => ({ ...v, note: e.target.value }))}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={verifyBusy}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={verifyBusy || performance?.verifiedLiveCount == null}
                    onClick={() => void clearVerification()}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Clear override
                  </button>
                </form>
              </section>
            ) : null}

            {eligibility ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                <p className="mb-2 font-semibold text-neutral-800">Slaughter Eligibility</p>
                {eligibility.eligibleForSlaughter ? (
                  <p className="text-emerald-700">Eligible for slaughter.</p>
                ) : (
                  <div className="space-y-1">
                    {eligibility.blockers.map((b, i) => (
                      <p key={`${b.type}-${i}`} className="text-amber-700">
                        {b.type === "withdrawal"
                          ? `${b.medicineName ?? "Treatment"} withdrawal active until ${b.safeAfter ?? "clearance"}`
                          : `Missed treatment round at ${b.plannedFor ?? "unknown time"}`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="mb-2 font-semibold text-neutral-800">Today&apos;s Critical Tasks</p>
              <ul className="space-y-1">
                {eligibility && !eligibility.eligibleForSlaughter ? (
                  <li className="text-amber-700">Resolve withdrawal/missed treatment blockers before slaughter actions.</li>
                ) : null}
                <li className="text-neutral-700">Check-in due: {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}</li>
                <li className="text-neutral-700">Review mortality and feed trends for this flock.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="mb-2 font-semibold text-neutral-800">Mortality & Health</p>
              <p className="text-neutral-700">
                Current live estimate: <span className="font-semibold">{performance?.birdsLiveEstimate ?? "—"}</span>
              </p>
              <p className="text-neutral-700">
                Cycle FCR: <span className="font-semibold">{performance?.fcr != null ? performance.fcr.toFixed(2) : "—"}</span>
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                <p className="text-sm font-medium text-neutral-800">Round check-in</p>
                <CheckinUrgencyBadge badge={status.checkinBadge} />
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-500">Bird age</dt>
                  <dd className="font-medium text-neutral-900">Day {status.ageDays}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Check-in every</dt>
                  <dd className="font-medium text-neutral-900">{status.intervalHours} h</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Last check-in</dt>
                  <dd className="font-mono text-xs text-neutral-900">
                    {status.lastCheckinAt
                      ? new Date(status.lastCheckinAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Next due (Kigali)</dt>
                  <dd className="font-mono text-xs text-neutral-900">
                    {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
              <p className="mb-2 font-semibold text-neutral-800">Allowed Actions</p>
              <div className="space-y-2">
                {treatmentAction.mode === "enabled" ? (
                  <Link
                    to="/farm/treatments"
                    className="block w-full rounded-lg border border-neutral-300 px-3 py-2 text-left text-xs hover:bg-neutral-50"
                  >
                    Execute treatment round
                  </Link>
                ) : null}
                {weighinAction.mode === "enabled" ? (
                  <a
                    href="#weigh-in"
                    className="block w-full rounded-lg border border-neutral-300 px-3 py-2 text-left text-xs hover:bg-neutral-50"
                  >
                    Record weigh-in
                  </a>
                ) : null}
                {slaughterAction.mode === "enabled" ? (
                  <Link
                    to="/farm/slaughter"
                    className="block w-full rounded-lg border border-neutral-300 px-3 py-2 text-left text-xs hover:bg-neutral-50"
                  >
                    Schedule slaughter
                  </Link>
                ) : null}
                {alertAction.mode !== "hidden" ? (
                  <button
                    type="button"
                    disabled={alertAction.mode !== "enabled"}
                    className="w-full cursor-not-allowed rounded-lg border border-neutral-300 px-3 py-2 text-left text-xs disabled:opacity-60"
                    title={alertAction.reason ?? ""}
                  >
                    Acknowledge critical alert
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
