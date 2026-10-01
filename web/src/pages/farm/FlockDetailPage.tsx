import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { flockActionPresentation, isCompanyLevelAdmin, isFarmOpsLead } from "../../auth/permissions";
import { readAuthHeaders, jsonAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { ManagerPage } from "../../components/layout/ManagerPage";
import {
  Button,
  FacetFilter,
  Metric,
  Modal,
  SectionCard,
  StatusPill,
  TableToolbar,
} from "../../components/ui";
import { formatManagerDate, formatManagerDateTime } from "../../lib/formatManagerDateTime";
import type { CheckinStatus } from "./checkinStatusTypes";

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

const controlClass =
  "h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)]";

export function FlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [flockPickerOptions, setFlockPickerOptions] = useState<FlockPickerRow[]>([]);
  const [flockMeta, setFlockMeta] = useState<{ label: string; placementDate: string } | null>(null);
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

  const canVerifyHeadcount = isCompanyLevelAdmin(user);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const listQ = isFarmOpsLead(user) ? "?includeArchived=true" : "";
      const fr = await fetch(`${API_BASE_URL}/api/flocks${listQ}`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error((fd as { error?: string }).error);
      const list = (fd.flocks as { id: string; label: string; placementDate: string }[]) ?? [];
      setFlockPickerOptions(list.map((row) => ({ id: row.id, label: row.label })));
      const f = list.find((x) => x.id === id);
      if (!f) throw new Error("Flock not found");
      setFlockMeta({ label: f.label, placementDate: f.placementDate });

      const sr = await fetch(`${API_BASE_URL}/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error((sd as { error?: string }).error);
      setStatus(sd as CheckinStatus);
      const pr = await fetch(`${API_BASE_URL}/api/flocks/${id}/performance-summary`, {
        headers: readAuthHeaders(token),
      });
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
      showToast("success", "Weigh-in saved.");
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

  const fcrContext =
    performance?.fcrBroiler?.fcrCumulative != null
      ? `Target ${performance.fcrBroiler.fcrTargetMin.toFixed(2)}–${performance.fcrBroiler.fcrTargetMax.toFixed(2)}`
      : performance?.fcrSlaughter != null
        ? "From harvest"
        : "Needs weigh-in";

  return (
    <ManagerPage>
      <PageHeader
        title={flockMeta?.label ?? "Flock"}
        meta={
          flockMeta ? (
            <span className="tabular-nums">Placed {formatManagerDate(flockMeta.placementDate)}</span>
          ) : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {treatmentAction.mode === "enabled" ? (
              <Link to="/farm/treatments">
                <Button size="sm" variant="secondary">
                  Treatment
                </Button>
              </Link>
            ) : null}
            {slaughterAction.mode === "enabled" ? (
              <Link to="/farm/slaughter">
                <Button size="sm" variant="secondary">
                  Slaughter
                </Button>
              </Link>
            ) : null}
            {weighinAction.mode === "enabled" ? (
              <Button size="sm" variant="primary" onClick={() => setShowWeighInForm(true)}>
                Record weigh-in
              </Button>
            ) : null}
          </div>
        }
      />

      {!loading && flockPickerOptions.length > 0 && id ? (
        <TableToolbar
          filters={
            <FacetFilter
              label="Flock"
              value={id}
              allValue="all"
              allLabel="All flocks"
              onChange={(v) => {
                if (v === "all") {
                  void navigate("/farm/flocks");
                  return;
                }
                const hash = location.hash ?? "";
                void navigate(`/farm/flocks/${encodeURIComponent(v)}${hash}`);
              }}
              options={flockPickerOptions.map((f) => ({ value: f.id, label: f.label }))}
            />
          }
          actions={
            <Link to={`/farm/reports?type=flock_deep_dive&flockId=${encodeURIComponent(id)}`}>
              <Button size="sm" variant="ghost">
                Report
              </Button>
            </Link>
          }
        />
      ) : null}

      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {flockMeta && status && !loading && !error ? (
        <div className="space-y-stack">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral">Day {status.ageDays}</StatusPill>
            <CheckinUrgencyBadge badge={status.checkinBadge} />
            {eligibility ? (
              eligibility.eligibleForSlaughter ? (
                <StatusPill tone="success">Slaughter OK</StatusPill>
              ) : (
                <StatusPill tone="warning">Withdrawal / blocked</StatusPill>
              )
            ) : null}
            {performance?.verifiedLiveCount != null ? (
              <StatusPill tone="info">Verified count</StatusPill>
            ) : null}
            <span className="type-caption text-[var(--text-muted)]">
              Next check-in {formatManagerDateTime(status.nextDueAt)}
            </span>
          </div>

          {performance ? (
            <div className="grid gap-3 rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-card)] p-card shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Day"
                value={status.ageDays}
                context={`Every ${status.intervalHours}h`}
              />
              <Metric
                label="Live birds"
                value={performance.birdsLiveEstimate.toLocaleString()}
                context={
                  performance.verifiedLiveCount != null
                    ? "Manager override"
                    : "Placement − mort − harvest"
                }
              />
              <Metric
                label="Feed to date"
                value={`${performance.feedToDateKg.toLocaleString()} kg`}
              />
              <Metric
                label="Cycle FCR"
                value={performance.fcr != null ? performance.fcr.toFixed(2) : "—"}
                context={fcrContext}
              />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-stack min-w-0">
              <SectionCard
                title="Weigh-ins"
                controls={
                  weighinAction.mode === "enabled" ? (
                    <Button size="sm" variant="secondary" onClick={() => setShowWeighInForm(true)}>
                      Record
                    </Button>
                  ) : null
                }
                flushBody
              >
                {weighIns.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] type-caption text-[var(--text-muted)]">
                          <th className="px-card py-2 font-medium">Date</th>
                          <th className="px-card py-2 font-medium">Avg kg</th>
                          <th className="px-card py-2 font-medium">Feed/kg sample</th>
                          <th className="px-card py-2 font-medium">vs target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weighIns.map((w) => {
                          const ratio = w.feedPerKgSampleBiomass ?? w.fcr;
                          return (
                            <tr key={w.id} className="border-b border-[var(--border-color)]/60 last:border-0">
                              <td className="px-card py-2.5 tabular-nums text-[var(--text-primary)]">
                                {formatManagerDate(w.weighDate)}
                              </td>
                              <td className="px-card py-2.5 tabular-nums font-medium">
                                {w.avgWeightKg.toFixed(2)}
                              </td>
                              <td className="px-card py-2.5 tabular-nums text-[var(--text-secondary)]">
                                {ratio != null ? ratio.toFixed(2) : "—"}
                              </td>
                              <td className="px-card py-2.5 tabular-nums text-[var(--text-secondary)]">
                                {w.variancePct != null
                                  ? `${w.variancePct > 0 ? "+" : ""}${w.variancePct}%`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-card py-6 type-caption text-[var(--text-muted)]">No weigh-ins yet.</p>
                )}
              </SectionCard>

              {eligibility && !eligibility.eligibleForSlaughter ? (
                <SectionCard title="Slaughter blockers">
                  <ul className="space-y-1.5 text-sm">
                    {eligibility.blockers.map((b, i) => (
                      <li key={`${b.type}-${i}`} className="text-[var(--status-warning)]">
                        {b.type === "withdrawal"
                          ? `${b.medicineName ?? "Treatment"} withdrawal until ${b.safeAfter ?? "clearance"}`
                          : `Missed treatment round at ${b.plannedFor ?? "unknown time"}`}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}

              {canVerifyHeadcount ? (
                <SectionCard title="Verify head count">
                  <form onSubmit={(ev) => void submitVerification(ev)} className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[8rem] flex-1 space-y-1">
                      <span className="type-label">Physical count</span>
                      <input
                        className={controlClass}
                        inputMode="numeric"
                        value={verifyForm.liveCount}
                        onChange={(e) => setVerifyForm((v) => ({ ...v, liveCount: e.target.value }))}
                        placeholder={
                          performance?.computedBirdsLiveEstimate != null
                            ? `Calc ${performance.computedBirdsLiveEstimate}`
                            : undefined
                        }
                      />
                    </label>
                    <label className="min-w-[12rem] flex-[2] space-y-1">
                      <span className="type-label">Note</span>
                      <input
                        className={controlClass}
                        value={verifyForm.note}
                        onChange={(e) => setVerifyForm((v) => ({ ...v, note: e.target.value }))}
                      />
                    </label>
                    <Button variant="secondary" size="sm" type="submit" disabled={verifyBusy} loading={verifyBusy}>
                      Save
                    </Button>
                    {performance?.verifiedLiveCount != null ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={verifyBusy}
                        onClick={() => void clearVerification()}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </form>
                </SectionCard>
              ) : null}
            </div>

            <aside className="space-y-stack">
              <SectionCard title="Check-in">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Last</dt>
                    <dd className="text-right tabular-nums text-[var(--text-primary)]">
                      {formatManagerDateTime(status.lastCheckinAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Next</dt>
                    <dd className="text-right tabular-nums text-[var(--text-primary)]">
                      {formatManagerDateTime(status.nextDueAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-muted)]">Interval</dt>
                    <dd className="tabular-nums text-[var(--text-primary)]">{status.intervalHours}h</dd>
                  </div>
                </dl>
                {id ? (
                  <Link
                    to={`/farm/vet-logs?flockId=${encodeURIComponent(id)}`}
                    className="mt-3 inline text-sm font-semibold text-[var(--primary-color)] underline-offset-2 hover:underline"
                  >
                    Vet logs
                  </Link>
                ) : null}
              </SectionCard>
            </aside>
          </div>
        </div>
      ) : null}

      <Modal open={showWeighInForm} title="Record weigh-in" onClose={() => setShowWeighInForm(false)} wide>
        <form onSubmit={(ev) => void submitWeighIn(ev)} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="type-label">Weigh date</span>
            <input
              type="date"
              className={controlClass}
              value={weighForm.weighDate}
              onChange={(e) => setWeighForm((v) => ({ ...v, weighDate: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="type-label">Age (days)</span>
            <input
              className={controlClass}
              inputMode="numeric"
              value={weighForm.ageDays}
              onChange={(e) => setWeighForm((v) => ({ ...v, ageDays: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="type-label">Sample size</span>
            <input
              className={controlClass}
              inputMode="numeric"
              value={weighForm.sampleSize}
              onChange={(e) => setWeighForm((v) => ({ ...v, sampleSize: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="type-label">Avg weight (kg)</span>
            <input
              className={controlClass}
              inputMode="decimal"
              value={weighForm.avgWeightKg}
              onChange={(e) => setWeighForm((v) => ({ ...v, avgWeightKg: e.target.value }))}
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="type-label">Total feed used (kg) to this date</span>
            <input
              className={controlClass}
              inputMode="decimal"
              value={weighForm.totalFeedUsedKg}
              onChange={(e) => setWeighForm((v) => ({ ...v, totalFeedUsedKg: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="type-label">Target weight (kg)</span>
            <input
              className={controlClass}
              inputMode="decimal"
              value={weighForm.targetWeightKg}
              onChange={(e) => setWeighForm((v) => ({ ...v, targetWeightKg: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="type-label">Notes</span>
            <input
              className={controlClass}
              value={weighForm.notes}
              onChange={(e) => setWeighForm((v) => ({ ...v, notes: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowWeighInForm(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={weighBusy} loading={weighBusy}>
              Save weigh-in
            </Button>
          </div>
        </form>
      </Modal>
    </ManagerPage>
  );
}
