import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pill } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { createTreatment, fetchTreatments, type TreatmentRow } from "../../api/farm.api";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { useFieldTaskState } from "../../hooks/useFieldTaskState";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useToast } from "../../components/Toast";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { FieldHeaderAction } from "../../components/layout/FieldHeaderAction";
import { FieldFlockContextBar } from "../../components/field/FieldFlockContextBar";
import { FieldTaskHub } from "../../components/field/FieldTaskHub";
import { FieldStepSheet } from "../../components/field/FieldStepSheet";
import { DoseStepper } from "../../components/field/DoseStepper";
import { FieldHistoryList } from "../../components/field/FieldHistoryList";
import { FieldFilterBar, FieldFilterPreset } from "../../components/field/FieldFilterBar";
import { fieldHubTeachingStatus } from "../../components/field/fieldHubTeaching";
import { FlockScopeSelector } from "../../components/field/FlockScopeSelector";
import { buildFlockPassportMetrics } from "../../components/field/fieldFlockMetrics";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { Button, StatusPill, Textarea } from "../../components/ui";

const ROUTE_VALUES = ["oral", "injection", "waterline", "spray", "other"] as const;
const DOSE_UNIT_VALUES = ["ml", "g", "mg", "tablet", "drop", "other"] as const;

type Medicine = {
  id: string;
  name: string;
  unit: string;
  withdrawalDays: number;
};

type OverdueRound = { id: string; medicineName: string; overdueMinutes: number };

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function withdrawalDaysLeft(at: string, withdrawalDays: number): number | null {
  if (!withdrawalDays) return null;
  const endsAt = new Date(at).getTime() + withdrawalDays * 24 * 60 * 60 * 1000;
  return Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000));
}

export function FarmTreatmentFieldView() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const logOpen = searchParams.get("log") === "1";
  const logStep = Math.min(2, Math.max(1, Number(searchParams.get("step") || "1") || 1));
  const historyOpen = searchParams.get("view") === "history";

  const tRoutine = useLaborerT("Routine prevention");
  const tSuspected = useLaborerT("Suspected infection");
  const tConfirmed = useLaborerT("Confirmed infection");
  const tVetDirective = useLaborerT("Vet directive");
  const tOther = useLaborerT("Other");
  const tOral = useLaborerT("oral");
  const tInjection = useLaborerT("injection");
  const tWaterline = useLaborerT("waterline");
  const tSpray = useLaborerT("spray");
  const tMl = useLaborerT("ml");
  const tG = useLaborerT("g");
  const tMg = useLaborerT("mg");
  const tTablet = useLaborerT("tablet");
  const tDrop = useLaborerT("drop");

  const fallbackReasonOptions = useMemo(
    () => [
      { value: "routine_prevention", label: tRoutine },
      { value: "suspected_infection", label: tSuspected },
      { value: "confirmed_infection", label: tConfirmed },
      { value: "vet_directive", label: tVetDirective },
      { value: "other", label: tOther },
    ],
    [tRoutine, tSuspected, tConfirmed, tVetDirective, tOther]
  );

  const routeLabel = useCallback(
    (value: string) => {
      const map: Record<string, string> = {
        oral: tOral,
        injection: tInjection,
        waterline: tWaterline,
        spray: tSpray,
        other: tOther,
      };
      return map[value] ?? value;
    },
    [tOral, tInjection, tWaterline, tSpray, tOther]
  );

  const unitLabel = useCallback(
    (value: string) => {
      const map: Record<string, string> = {
        ml: tMl,
        g: tG,
        mg: tMg,
        tablet: tTablet,
        drop: tDrop,
        other: tOther,
      };
      return map[value] ?? value;
    },
    [tMl, tG, tMg, tTablet, tDrop, tOther]
  );

  const treatmentReasonOptions = useReferenceOptions("treatment_reason", token, fallbackReasonOptions);
  const routeOptions = useReferenceOptions(
    "treatment_route",
    token,
    ROUTE_VALUES.map((r) => ({ value: r, label: routeLabel(r) }))
  );
  const doseUnitOptions = useReferenceOptions(
    "treatment_dose_unit",
    token,
    DOSE_UNIT_VALUES.map((r) => ({ value: r, label: unitLabel(r) }))
  );

  const tTitle = useLaborerT("Medicine tracking");
  const tHistory = useLaborerT("History");
  const tBack = useLaborerT("Back");
  const tFlock = useLaborerT("Flock");
  const tDay = useLaborerT("Day");
  const tLiveBirds = useLaborerT("Live birds");
  const tNoFlockTitle = useLaborerT("No flock available");
  const tNoFlockBody = useLaborerT("Round status appears when a flock is assigned to your site.");
  const tGoHome = useLaborerT("Back to home");
  const tNoTreatments = useLaborerT("No treatments this cycle");
  const tRecord = useLaborerT("Record treatment");
  const tRecent = useLaborerT("Recent treatments");
  const tNoRecent = useLaborerT("No treatments yet for this flock.");
  const tSaving = useLaborerT("Saving…");
  const tSave = useLaborerT("Save treatment");
  const tSuccess = useLaborerT("Treatment recorded.");
  const tAddNotes = useLaborerT("Add notes");
  const tNotes = useLaborerT("Notes (optional)");
  const tOverdueRounds = useLaborerT("{count} medicine round(s) overdue");
  const tStepWhy = useLaborerT("Why & which medicine");
  const tStepDose = useLaborerT("Dose & route");
  const tMedicine = useLaborerT("Medicine");
  const tReason = useLaborerT("Reason");
  const tRoute = useLaborerT("Route");
  const tDose = useLaborerT("Dose");
  const tUnit = useLaborerT("Unit");
  const tCourse = useLaborerT("Course (optional)");
  const tDuration = useLaborerT("Duration (days)");
  const tWithdrawalBadge = useLaborerT("Withdrawal {days}d");
  const tWithdrawal = useLaborerT("Withdrawal (days)");
  const tOtherDetails = useLaborerT("Condition details");
  const tSelectMedicine = useLaborerT("Select medicine");
  const tNext = useLaborerT("Next");
  const tLast7d = useLaborerT("Last 7d");
  const tLast30d = useLaborerT("Last 30d");
  const tCycle = useLaborerT("Cycle to date");

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error: ctxError,
    loadFlocks,
    loadDetails,
  } = useFlockFieldContext(token);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRow[]>([]);
  const [historyRows, setHistoryRows] = useState<TreatmentRow[]>([]);
  const [overdueRounds, setOverdueRounds] = useState<OverdueRound[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState(new Date().toISOString().slice(0, 10));

  const [form, setForm] = useState({
    reasonCode: "routine_prevention",
    diseaseOrReason: "",
    medicineName: "",
    medicineId: "",
    dose: "",
    doseUnit: "ml",
    route: "oral",
    durationDays: "1",
    withdrawalDays: "0",
    notes: "",
  });
  const [showNotes, setShowNotes] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [showOtherReason, setShowOtherReason] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const pageState = useFieldTaskState({
    listLoading,
    error: ctxError,
    flockCount: flocks.length,
    needsStock: false,
  });

  const loadHubData = useCallback(async () => {
    if (!token || !flockId) {
      setTreatments([]);
      setOverdueRounds([]);
      return;
    }
    setLoadError(null);
    try {
      const [medRes, treatData, odRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/medicine`, { headers: readAuthHeaders(token) }),
        fetchTreatments(token, flockId, { limit: 10 }),
        fetch(
          `${API_BASE_URL}/api/treatment-rounds/overdue?flock_id=${encodeURIComponent(flockId)}`,
          { headers: readAuthHeaders(token) }
        ),
      ]);
      const md = await medRes.json().catch(() => ({ medicines: [] }));
      if (medRes.ok) setMedicines((md as { medicines?: Medicine[] }).medicines ?? []);
      setTreatments(treatData.treatments ?? []);
      const od = await odRes.json().catch(() => ({ overdueRounds: [] }));
      if (odRes.ok) setOverdueRounds((od as { overdueRounds?: OverdueRound[] }).overdueRounds ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Load failed");
    }
  }, [token, flockId]);

  const loadHistory = useCallback(async () => {
    if (!token || !flockId) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const data = await fetchTreatments(token, flockId, { startAt: startAt || undefined, endAt: endAt || undefined });
      setHistoryRows(data.treatments ?? []);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [token, flockId, startAt, endAt]);

  useEffect(() => {
    void loadHubData();
  }, [loadHubData]);

  useEffect(() => {
    if (historyOpen) void loadHistory();
  }, [historyOpen, loadHistory]);

  const activeWithdrawal = useMemo(() => {
    for (const t of treatments) {
      const left = withdrawalDaysLeft(t.at, t.withdrawalDays);
      if (left != null && left > 0) return { medicine: t.medicineName, daysLeft: left };
    }
    return null;
  }, [treatments]);

  const hubTeaching = fieldHubTeachingStatus(treatments.length > 0, { title: tNoTreatments });
  const statusTitle = overdueRounds.length ? undefined : hubTeaching.statusTitle;
  const statusSubtitle = overdueRounds.length
    ? tOverdueRounds.replace("{count}", String(overdueRounds.length))
    : hubTeaching.statusSubtitle;

  const reasonChips = treatmentReasonOptions.slice(0, 4);
  const otherReasonOption = treatmentReasonOptions.find((o) => o.value === "other");
  const reasonOptions = otherReasonOption ? [...reasonChips, otherReasonOption] : reasonChips;
  const selectedReasonLabel =
    treatmentReasonOptions.find((o) => o.value === form.reasonCode)?.label ?? form.reasonCode;

  function setLogStep(step: number) {
    setSearchParams({ log: "1", step: String(step) });
  }

  function openLog() {
    setSearchParams({ log: "1", step: "1" });
  }

  function closeLog() {
    setSearchParams({});
    setFieldError(null);
    setShowCourse(false);
    setShowNotes(false);
  }

  function handleLogBack() {
    if (logStep > 1) setLogStep(1);
    else closeLog();
  }

  function openHistory() {
    setSearchParams({ view: "history" });
  }

  function applyMedicine(id: string) {
    const med = medicines.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      medicineId: id,
      medicineName: med?.name ?? f.medicineName,
      doseUnit: med?.unit ?? f.doseUnit,
      withdrawalDays: med ? String(med.withdrawalDays) : f.withdrawalDays,
    }));
  }

  async function handleSubmit() {
    if (!flockId || !token) return;
    const dose = Number(form.dose);
    if (!form.medicineName.trim()) {
      setFieldError("Medicine name is required.");
      return;
    }
    if (!Number.isFinite(dose) || dose <= 0) {
      setFieldError("Enter a valid dose.");
      return;
    }
    setFieldError(null);
    setBusy(true);
    setSubmitStage("submitting");
    try {
      await createTreatment(token, flockId, {
        reasonCode: form.reasonCode,
        diseaseOrReason: form.diseaseOrReason || form.reasonCode,
        medicineName: form.medicineName.trim(),
        dose,
        doseUnit: form.doseUnit,
        route: form.route,
        durationDays: Number(form.durationDays) || 1,
        withdrawalDays: Number(form.withdrawalDays) || 0,
        notes: form.notes || "",
      });
      showToast("success", tSuccess);
      setForm({
        reasonCode: "routine_prevention",
        diseaseOrReason: "",
        medicineName: "",
        medicineId: "",
        dose: "",
        doseUnit: "ml",
        route: "oral",
        durationDays: "1",
        withdrawalDays: "0",
        notes: "",
      });
      setShowNotes(false);
      await loadHubData();
      closeLog();
      setSubmitStage("success");
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setFieldError(msg);
      showToast("error", msg);
      setSubmitStage("idle");
    } finally {
      setBusy(false);
    }
  }

  const datePresets = useMemo(
    () => ({
      set7d: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        setStartAt(start.toISOString().slice(0, 10));
        setEndAt(end.toISOString().slice(0, 10));
      },
      set30d: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        setStartAt(start.toISOString().slice(0, 10));
        setEndAt(end.toISOString().slice(0, 10));
      },
      setCycle: () => {
        setStartAt("");
        setEndAt(new Date().toISOString().slice(0, 10));
      },
    }),
    []
  );

  if (submitStage === "submitting" || submitStage === "success") {
    return (
      <SubmissionStageScreen
        stage={submitStage === "submitting" ? "submitting" : "success"}
        successText={tSuccess}
      />
    );
  }

  if (logOpen && pageState === "ready") {
    const flockContext = status?.label
      ? `${status.label}${status.ageDays != null ? ` · ${tDay} ${status.ageDays}` : ""}`
      : null;
    const step1Ready =
      Boolean(form.medicineName.trim()) &&
      (form.reasonCode !== "other" || Boolean(form.diseaseOrReason.trim()));
    const commonRouteOptions = routeOptions.slice(0, 4);

    return (
      <FieldStepSheet
        title={tRecord}
        backLabel={tBack}
        onBack={handleLogBack}
        step={logStep}
        totalSteps={2}
        stepLabel={logStep === 1 ? tStepWhy : tStepDose}
        nextLabel={tNext}
        nextDisabled={!step1Ready}
        onNext={() => setLogStep(2)}
        submitLabel={tSave}
        submittingLabel={tSaving}
        busy={busy}
        onSubmit={() => void handleSubmit()}
        submitDisabled={!flockId || !form.medicineName.trim() || !(Number(form.dose) > 0)}
      >
        {logStep === 1 && flockContext ? (
          <p className="rounded-xl bg-[var(--surface-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)]">
            {flockContext}
          </p>
        ) : null}

        {logStep === 1 ? (
          <>
            <div>
              <p className="type-label mb-2">{tReason}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tReason}>
                {reasonOptions.map((opt) => {
                  const active = opt.value === form.reasonCode;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setForm((f) => ({ ...f, reasonCode: opt.value }));
                        setShowOtherReason(opt.value === "other");
                      }}
                      className={`bounce-tap min-h-[52px] rounded-xl border px-3 py-2 text-left text-sm font-semibold leading-snug transition ${
                        active
                          ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                          : "border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {showOtherReason || form.reasonCode === "other" ? (
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tOtherDetails}
                <input
                  className="mt-1 w-full min-h-[48px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
                  value={form.diseaseOrReason}
                  onChange={(e) => setForm((f) => ({ ...f, diseaseOrReason: e.target.value }))}
                />
              </label>
            ) : null}

            <div>
              <p className="type-label mb-2">{tMedicine}</p>
              {medicines.length > 0 && medicines.length <= 6 ? (
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tMedicine}>
                  {medicines.map((m) => {
                    const active = form.medicineId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => applyMedicine(m.id)}
                        className={`bounce-tap min-h-[52px] rounded-xl border px-3 py-2 text-left text-sm font-semibold leading-snug transition ${
                          active
                            ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                            : "border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                        }`}
                      >
                        <span className="block">{m.name}</span>
                        <span className="mt-0.5 block text-xs font-normal opacity-80">{m.unit}</span>
                      </button>
                    );
                  })}
                </div>
              ) : medicines.length > 0 ? (
                <select
                  className="w-full min-h-[52px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
                  value={form.medicineId}
                  onChange={(e) => applyMedicine(e.target.value)}
                >
                  <option value="">{tSelectMedicine}</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full min-h-[52px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
                  placeholder={tMedicine}
                  value={form.medicineName}
                  onChange={(e) => setForm((f) => ({ ...f, medicineName: e.target.value }))}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-[var(--border-color)] pb-3">
              <p className="text-base font-semibold text-[var(--text-primary)]">{form.medicineName}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {[selectedReasonLabel, flockContext].filter(Boolean).join(" · ")}
              </p>
            </div>

            <DoseStepper
              label={tDose}
              value={Number(form.dose) || 0}
              unit={form.doseUnit}
              step={form.doseUnit === "g" || form.doseUnit === "mg" ? 0.5 : 1}
              onChange={(n) => setForm((f) => ({ ...f, dose: n > 0 ? String(n) : "" }))}
            />

            {!form.medicineId && medicines.length === 0 ? (
              <div>
                <p className="type-label mb-2">{tUnit}</p>
                <div className="flex flex-wrap gap-2">
                  {doseUnitOptions.slice(0, 5).map((u) => {
                    const active = form.doseUnit === u.value;
                    return (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, doseUnit: u.value }))}
                        className={`bounce-tap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                          active
                            ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                            : "border-[var(--border-color)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <p className="type-label mb-2">{tRoute}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tRoute}>
                {commonRouteOptions.map((r) => {
                  const active = form.route === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setForm((f) => ({ ...f, route: r.value }))}
                      className={`bounce-tap min-h-[48px] rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${
                        active
                          ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                          : "border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {showCourse ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  {tDuration}
                  <input
                    inputMode="numeric"
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
                    value={form.durationDays}
                    onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  {tWithdrawal}
                  <input
                    inputMode="numeric"
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
                    value={form.withdrawalDays}
                    onChange={(e) => setForm((f) => ({ ...f, withdrawalDays: e.target.value }))}
                  />
                </label>
              </div>
            ) : null}

            {showNotes ? (
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tNotes}
                <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
            ) : null}

            {!showCourse || !showNotes ? (
              <div className="grid grid-cols-2 gap-2">
                {!showCourse ? (
                  <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" onClick={() => setShowCourse(true)}>
                    {tCourse}
                  </Button>
                ) : null}
                {!showNotes ? (
                  <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" onClick={() => setShowNotes(true)}>
                    {tAddNotes}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {fieldError ? (
          <p className="text-sm text-[var(--status-danger)]" role="alert">
            {fieldError}
          </p>
        ) : null}
      </FieldStepSheet>
    );
  }

  if (historyOpen && pageState !== "loading") {
    return (
      <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
        <FieldPageHeader title={tHistory} variant="history" backTo={companyHref("/farm/treatments")} showAccount />

        <FlockScopeSelector flocks={flocks} flockId={flockId} onChange={setFlockId} label={tFlock} />

        <FieldFilterBar>
          <div className="flex flex-wrap gap-2">
            <FieldFilterPreset label={tLast7d} onClick={datePresets.set7d} />
            <FieldFilterPreset label={tLast30d} onClick={datePresets.set30d} />
            <FieldFilterPreset label={tCycle} onClick={datePresets.setCycle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              className="min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
            <input
              type="date"
              className="min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </FieldFilterBar>

        {historyLoading ? <SkeletonList rows={4} /> : null}
        {!historyLoading ? (
          <FieldHistoryList
            items={historyRows.map((r) => ({
              id: r.id,
              primary: `${r.medicineName} · ${r.dose} ${r.doseUnit}`,
              meta: `${formatDate(r.at)} · ${r.route}`,
            }))}
            emptyText={tNoRecent}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      <FieldPageHeader
        title={tTitle}
        backTo={companyHref("/dashboard/vet")}
        showAccount
        action={<FieldHeaderAction onClick={openHistory}>{tHistory}</FieldHeaderAction>}
      />

      {pageState === "loading" ? <SkeletonList rows={3} /> : null}

      {pageState === "error" ? (
        <ErrorState
          message={ctxError ?? ""}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
            void loadHubData();
          }}
        />
      ) : null}

      {pageState === "no_flocks" ? (
        <FieldBlockedScreen
          title={tNoFlockTitle}
          description={tNoFlockBody}
          icon={<Pill className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
          action={
            <Button type="button" size="field" className="w-full" onClick={() => navigate(companyHref("/dashboard/vet"))}>
              {tGoHome}
            </Button>
          }
        />
      ) : null}

      {pageState === "ready" ? (
        <>
          <FieldFlockContextBar
            flocks={flocks}
            flockId={flockId}
            onFlockChange={setFlockId}
            flockLabel={tFlock}
            flockLabelText={status?.label}
            badgeSlot={
              activeWithdrawal ? (
                <StatusPill tone="warning">
                  {tWithdrawalBadge.replace("{days}", String(activeWithdrawal.daysLeft))}
                </StatusPill>
              ) : null
            }
            loading={Boolean(flockId && !status && detailLoading)}
            metrics={
              status
                ? buildFlockPassportMetrics(status, performance, {
                    day: tDay,
                    liveBirds: tLiveBirds,
                  })
                : []
            }
          />

          <FieldTaskHub
            statusTitle={statusTitle}
            statusSubtitle={statusSubtitle}
            primaryAction={
              <Button type="button" size="field" className="w-full" onClick={openLog}>
                {tRecord}
              </Button>
            }
          >
            {loadError ? <p className="text-sm text-[var(--status-warning)]">{loadError}</p> : null}
            <FieldHistoryList
              title={tRecent}
              items={treatments.slice(0, 2).map((r) => ({
                id: r.id,
                primary: r.medicineName,
                meta: `${r.dose} ${r.doseUnit} · ${formatDate(r.at)}`,
              }))}
              emptyText={tNoRecent}
            />
          </FieldTaskHub>
        </>
      ) : null}
    </div>
  );
}
