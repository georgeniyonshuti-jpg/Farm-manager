import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { flockActionPresentation } from "../../auth/permissions";
import { readAuthHeaders, jsonAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import type { CheckinStatus } from "./FarmCheckinPage";

type Eligibility = {
  eligibleForSlaughter: boolean;
  blockers: Array<{ type: string; medicineName?: string; safeAfter?: string; plannedFor?: string }>;
};
type WeighIn = { id: string; weighDate: string; avgWeightKg: number; fcr: number | null; variancePct: number | null };

type Performance = {
  feedToDateKg: number;
  fcr: number | null;
  birdsLiveEstimate: number;
  computedBirdsLiveEstimate?: number;
  verifiedLiveCount?: number | null;
  fcrWeighIn?: number | null;
  fcrSlaughter?: number | null;
};

export function FlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [flockMeta, setFlockMeta] = useState<{ label: string; placementDate: string } | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);

  const [weighBusy, setWeighBusy] = useState(false);
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
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error((fd as { error?: string }).error);
      const f = ((fd.flocks as { id: string; label: string; placementDate: string }[]) ?? []).find((x) => x.id === id);
      if (!f) throw new Error("Flock not found");
      setFlockMeta({ label: f.label, placementDate: f.placementDate });

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
  }, [id, token]);

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
      showToast("success", "Weigh-in saved. FCR is estimated from feed and sample weights.");
      setWeighForm((v) => ({
        ...v,
        avgWeightKg: "",
        totalFeedUsedKg: "",
        targetWeightKg: "",
        notes: "",
      }));
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
        subtitle={flockMeta ? <>Placement {flockMeta.placementDate}</> : undefined}
        action={
          <Link to="/farm/flocks" className="text-sm font-medium text-emerald-800 hover:underline">
            ← All flocks
          </Link>
        }
      />

      {loading && <SkeletonList rows={3} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {flockMeta && status && !loading && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
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
                  <p className="text-neutral-500">FCR</p>
                  <p className="font-semibold">{performance.fcr != null ? performance.fcr.toFixed(2) : "-"}</p>
                  {performance.fcrWeighIn != null ? (
                    <p className="mt-1 text-xs text-neutral-500">From latest weigh-in</p>
                  ) : performance.fcrSlaughter != null ? (
                    <p className="mt-1 text-xs text-neutral-500">From last harvest weights</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {weighinAction.mode === "enabled" ? (
              <section id="weigh-in" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm scroll-mt-4">
                <p className="mb-3 font-semibold text-neutral-800">Record weigh-in</p>
                <p className="mb-3 text-xs text-neutral-600">
                  Sample average weight and cumulative feed (kg) for this flock up to the weigh date. FCR on the row uses
                  feed ÷ (avg weight × sample size) as stored for trending.
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
              <p className="mb-2 font-semibold text-neutral-800">Weight & FCR History</p>
              {weighIns.length ? (
                <div className="space-y-1">
                  {weighIns.map((w) => (
                    <div key={w.id} className="grid grid-cols-4 gap-2 text-xs">
                      <span className="font-medium text-neutral-800">{w.weighDate}</span>
                      <span className="text-neutral-700">{w.avgWeightKg.toFixed(2)} kg</span>
                      <span className="text-neutral-700">FCR {w.fcr != null ? w.fcr.toFixed(2) : "—"}</span>
                      <span className="text-neutral-600">{w.variancePct != null ? `${w.variancePct > 0 ? "+" : ""}${w.variancePct}%` : "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500">No weigh-ins yet.</p>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="mb-2 font-semibold text-neutral-800">Mortality & Health</p>
              <p className="text-neutral-700">
                Current live estimate: <span className="font-semibold">{performance?.birdsLiveEstimate ?? "—"}</span>
              </p>
              <p className="text-neutral-700">
                Current FCR: <span className="font-semibold">{performance?.fcr != null ? performance.fcr.toFixed(2) : "—"}</span>
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
