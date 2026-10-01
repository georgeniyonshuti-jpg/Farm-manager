import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import {
  fetchFlockFcrSnapshot,
  fetchVetLogDetail,
  fetchVetLogsList,
  type FcrBroilerSnapshot,
  type VetLogListRow,
} from "../../api/farm.api";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { useFieldTaskState } from "../../hooks/useFieldTaskState";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { vetLogNeedsManagerReview, isJuniorVet } from "../../auth/permissions";
import {
  HouseRoundStep,
  houseRoundPayloadFromState,
  validateHouseRoundStepKey,
  type HouseRoundState,
} from "../../components/field/HouseRoundStep";
import { VetLogMortalityReviewSection, type MortalityReviewPayload } from "../../components/farm/VetLogMortalityReviewSection";
import { VetLogReport } from "../../components/farm/reports/VetLogReport";
import { SubmissionReportModal } from "../../components/farm/reports/SubmissionReportModal";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { FieldHeaderAction } from "../../components/layout/FieldHeaderAction";
import { FieldFlockContextBar } from "../../components/field/FieldFlockContextBar";
import { buildFlockPassportMetrics } from "../../components/field/fieldFlockMetrics";
import { FieldTaskHub } from "../../components/field/FieldTaskHub";
import { FieldStepSheet } from "../../components/field/FieldStepSheet";
import { FieldHistoryList } from "../../components/field/FieldHistoryList";
import { FieldFilterBar } from "../../components/field/FieldFilterBar";
import { fieldHubTeachingStatus } from "../../components/field/fieldHubTeaching";
import { FlockScopeSelector } from "../../components/field/FlockScopeSelector";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { formatFieldDateTime } from "../../lib/formatFieldDateTime";
import { Button, SegmentedControl, Select, Textarea } from "../../components/ui";

type MedicineOption = { id: string; name: string; unit: string };

function resetFormState() {
  return {
    observations: "",
    actionsTaken: "",
    recommendations: "",
    logDate: new Date().toISOString().slice(0, 10),
    includeWeight: false,
    sampleSize: "30",
    avgWeightKg: "",
    cvPct: "",
    underweightPct: "",
    includeMedicine: false,
    medicineId: "",
    medicineName: "",
    medicineDose: "",
    medicineDoseUnit: "ml",
    medicineRoute: "drinking_water",
    medicineReason: "",
    medicineNotes: "",
  };
}

export function FarmVetLogsFieldView() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const logOpen = searchParams.get("log") === "1";
  const historyOpen = searchParams.get("view") === "history";
  const step = Math.min(5, Math.max(1, Number(searchParams.get("step") || "1") || 1));

  const tDrinkingWater = useLaborerT("Drinking water");
  const tFeedAdditive = useLaborerT("Feed additive");
  const tInjection = useLaborerT("Injection");
  const tTopical = useLaborerT("Topical");
  const tMl = useLaborerT("ml");
  const tG = useLaborerT("g");
  const tMg = useLaborerT("mg");
  const tTablet = useLaborerT("tablet");
  const tDoses = useLaborerT("doses");
  const tSachets = useLaborerT("sachets");
  const tOther = useLaborerT("other");

  const fallbackMedicineRoutes = useMemo(
    () => [
      { value: "drinking_water", label: tDrinkingWater },
      { value: "feed_additive", label: tFeedAdditive },
      { value: "injection", label: tInjection },
      { value: "topical", label: tTopical },
    ],
    [tDrinkingWater, tFeedAdditive, tInjection, tTopical]
  );

  const fallbackMedicineDoseUnits = useMemo(
    () => [
      { value: "ml", label: tMl },
      { value: "g", label: tG },
      { value: "mg", label: tMg },
      { value: "tablet", label: tTablet },
      { value: "doses", label: tDoses },
      { value: "sachets", label: tSachets },
      { value: "other", label: tOther },
    ],
    [tMl, tG, tMg, tTablet, tDoses, tSachets, tOther]
  );

  const medicineRouteOptions = useReferenceOptions("medicine_admin_route", token, fallbackMedicineRoutes);
  const medicineDoseUnitOptions = useReferenceOptions("treatment_dose_unit", token, fallbackMedicineDoseUnits);
  const needsManagerReview = user ? vetLogNeedsManagerReview(user) : false;

  function inferVisitSlot(): "am" | "pm" {
    const h = new Date().getHours();
    if (h >= 7 && h <= 10) return "am";
    if (h >= 17 && h <= 20) return "pm";
    return h < 14 ? "am" : "pm";
  }

  const [visitSlot, setVisitSlot] = useState<"am" | "pm" | "spot">(() =>
    user && isJuniorVet(user) ? inferVisitSlot() : "spot"
  );
  const [houseRound, setHouseRound] = useState<HouseRoundState>({
    photosFlockSign: [],
    photosThermometer: [],
    photosFeed: [],
    photosWater: [],
    coopTemperatureC: "",
    feedLevel: "full",
    waterLevel: "yes",
  });

  const requiresHouseRound = visitSlot === "am" || visitSlot === "pm" || Boolean(user && isJuniorVet(user));

  const tTitle = useLaborerT("Vet logs");
  const tHistory = useLaborerT("History");
  const tBack = useLaborerT("Back");
  const tFlock = useLaborerT("Flock");
  const tDay = useLaborerT("Day");
  const tLiveBirds = useLaborerT("Live birds");
  const tFCR = useLaborerT("FCR");
  const tNoFlockTitle = useLaborerT("No flock available");
  const tNoFlockBody = useLaborerT("Round status appears when a flock is assigned to your site.");
  const tGoHome = useLaborerT("Back to home");
  const tCreate = useLaborerT("Create vet log");
  const tNoVisit = useLaborerT("No visit logged this week");
  const tRecent = useLaborerT("Recent vet log");
  const tNoRecent = useLaborerT("No vet logs");
  const tSaving = useLaborerT("Saving…");
  const tSave = useLaborerT("Submit vet log");
  const tSubmitReview = useLaborerT("Submit for review");
  const tSuccess = useLaborerT("Vet log saved.");
  const tNext = useLaborerT("Next");
  const tStepFlock = useLaborerT("Flock & date");
  const tStepHouse = useLaborerT("House round");
  const tStepMortality = useLaborerT("Mortality review");
  const tStepClinical = useLaborerT("Clinical notes");
  const tStepExtras = useLaborerT("Optional extras");
  const tShowClinicalExtra = useLaborerT("Add actions & recommendations");
  const tLogDate = useLaborerT("Log date");
  const tVisitSlot = useLaborerT("Visit slot");
  const tAm = useLaborerT("AM");
  const tPm = useLaborerT("PM");
  const tSpot = useLaborerT("Spot");
  const tObservations = useLaborerT("Observations");
  const tActionsTaken = useLaborerT("Actions taken");
  const tRecommendations = useLaborerT("Recommendations");
  const tWeightSample = useLaborerT("Weight sample");
  const tYes = useLaborerT("Yes");
  const tNo = useLaborerT("No");
  const tBirdsWeighed = useLaborerT("Birds weighed (n)");
  const tAvgWeight = useLaborerT("Average weight (kg)");
  const tIncludeMedicine = useLaborerT("Include optional medicine");
  const tErrMortality = useLaborerT("Complete the mortality review section before saving.");
  const tErrObservations = useLaborerT("Observations are required.");
  const tErrCoopTemp = useLaborerT("Coop temperature is required.");
  const tErrThermo = useLaborerT("Add at least one thermometer photo.");
  const tErrFeedPhoto = useLaborerT("Add at least one feed photo when feed is available.");
  const tErrWaterPhoto = useLaborerT("Add at least one water photo when water is available.");
  const tErrFlockSign = useLaborerT("Add at least {min} flock sign photo(s).");
  const tSubmittedReview = useLaborerT("Vet log submitted for manager review.");
  const tErrLoadReport = useLaborerT("Could not load report");
  const tErrSave = useLaborerT("Save failed");
  const tErrWeightSample = useLaborerT("Weight sample requires sample size (≥1) and average weight (kg).");
  const tErrMedicine = useLaborerT("Medicine requires name and dose.");
  const tManualEntry = useLaborerT("Manual entry");
  const tMedicineName = useLaborerT("Medicine name");
  const tDose = useLaborerT("Dose");
  const tSearchKeywords = useLaborerT("Search keywords…");
  const tAll = useLaborerT("All");
  const tPending = useLaborerT("Pending");
  const tApproved = useLaborerT("Approved");
  const tRejected = useLaborerT("Rejected");
  const tLoadFailed = useLaborerT("Load failed");

  function translateHouseRoundError(key: string | null, minPhotos: number): string | null {
    if (!key) return null;
    if (key.includes("{min}")) return tErrFlockSign.replace("{min}", String(minPhotos));
    if (key === "Coop temperature is required.") return tErrCoopTemp;
    if (key === "Add at least one thermometer photo.") return tErrThermo;
    if (key === "Add at least one feed photo when feed is available.") return tErrFeedPhoto;
    if (key === "Add at least one water photo when water is available.") return tErrWaterPhoto;
    return key;
  }

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
  } = useFlockFieldContext(token, { defaultFlockId: "", autoSelectSingleFlock: true });

  const [logs, setLogs] = useState<VetLogListRow[]>([]);
  const [historyLogs, setHistoryLogs] = useState<VetLogListRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [logsError, setLogsError] = useState<string | null>(null);

  const [form, setForm] = useState(resetFormState);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [fcrSnap, setFcrSnap] = useState<FcrBroilerSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLog, setReportLog] = useState<VetLogListRow | null>(null);
  const [mortalityReview, setMortalityReview] = useState<MortalityReviewPayload | null>(null);
  const [mortalityReviewValid, setMortalityReviewValid] = useState(false);
  const [showClinicalExtra, setShowClinicalExtra] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const pageState = useFieldTaskState({
    listLoading,
    error: ctxError,
    flockCount: flocks.length,
    needsStock: false,
  });

  const handleMortalityReviewChange = useCallback((payload: MortalityReviewPayload | null, valid: boolean) => {
    setMortalityReview(payload);
    setMortalityReviewValid(valid);
  }, []);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchVetLogsList(token, {
        flockId: flockId || undefined,
        pageSize: 5,
      });
      setLogs(data.logs ?? []);
      setLogsError(null);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : tLoadFailed);
    }
  }, [token, flockId]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const data = await fetchVetLogsList(token, {
        flockId: flockId || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        q: searchQ || undefined,
        pageSize: 30,
      });
      setHistoryLogs(data.logs ?? []);
    } catch {
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [token, flockId, statusFilter, searchQ]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (historyOpen) void loadHistory();
  }, [historyOpen, loadHistory]);

  useEffect(() => {
    if (!token || !flockId) {
      setFcrSnap(null);
      return;
    }
    void fetchFlockFcrSnapshot(token, flockId)
      .then(setFcrSnap)
      .catch(() => setFcrSnap(null));
  }, [token, flockId]);

  useEffect(() => {
    if (!token || !logOpen) return;
    void fetch(`${API_BASE_URL}/api/medicine`, { headers: readAuthHeaders(token) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return;
        setMedicines((d as { medicines?: MedicineOption[] }).medicines ?? []);
      })
      .catch(() => setMedicines([]));
  }, [token, logOpen]);

  const hubTeaching = fieldHubTeachingStatus(logs.length > 0, { title: tNoVisit });

  const fcrMetric = fcrSnap?.fcrCumulative != null ? Number(fcrSnap.fcrCumulative).toFixed(2) : null;

  function setStep(next: number) {
    const clamped = Math.min(5, Math.max(1, next));
    setSearchParams({ log: "1", step: String(clamped) });
  }

  function openLog() {
    setSearchParams({ log: "1", step: "1" });
  }

  function closeLog() {
    setSearchParams({});
    setFieldError(null);
    setForm(resetFormState());
    setShowClinicalExtra(false);
  }

  function openHistory() {
    setSearchParams({ view: "history" });
  }

  async function openReport(logId: string) {
    if (!token) return;
    setReportOpen(true);
    setReportLoading(true);
    setReportLog(null);
    try {
      const d = await fetchVetLogDetail(token, logId);
      setReportLog(d.log);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : tErrLoadReport);
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  }

  function canAdvanceFromStep(s: number): boolean {
    if (s === 1) return Boolean(flockId && form.logDate && visitSlot);
    if (s === 2) {
      if (!requiresHouseRound) return true;
      return validateHouseRoundStepKey(houseRound, status?.photosRequiredPerRound ?? 1) == null;
    }
    if (s === 3) return mortalityReviewValid;
    if (s === 4) return form.observations.trim().length > 0;
    return true;
  }

  async function handleSubmit() {
    if (!flockId || !form.logDate) return;
    if (!mortalityReviewValid || !mortalityReview) {
      setFieldError(tErrMortality);
      return;
    }
    if (!form.observations.trim()) {
      setFieldError(tErrObservations);
      return;
    }
    if (requiresHouseRound) {
      const houseErrKey = validateHouseRoundStepKey(houseRound, status?.photosRequiredPerRound ?? 1);
      const houseErr = translateHouseRoundError(houseErrKey, status?.photosRequiredPerRound ?? 1);
      if (houseErr) {
        setFieldError(houseErr);
        return;
      }
    }
    setFieldError(null);
    setBusy(true);
    setSubmitStage("submitting");
    try {
      const body: Record<string, unknown> = {
        flockId,
        logDate: form.logDate,
        observations: form.observations,
        actionsTaken: form.actionsTaken,
        recommendations: form.recommendations,
        mortalityReview,
        visitSlot,
      };

      if (requiresHouseRound) {
        Object.assign(body, houseRoundPayloadFromState(houseRound));
      }

      if (form.includeWeight) {
        const sampleSize = Number(form.sampleSize);
        const avgWeightKg = Number(form.avgWeightKg);
        if (!Number.isFinite(sampleSize) || sampleSize < 1 || !Number.isFinite(avgWeightKg) || avgWeightKg <= 0) {
          throw new Error(tErrWeightSample);
        }
        body.weightSample = {
          sampleSize,
          avgWeightKg,
          totalFeedUsedKg: fcrSnap?.feedToDateKg,
          cvPct: form.cvPct ? Number(form.cvPct) : undefined,
          underweightPct: form.underweightPct ? Number(form.underweightPct) : undefined,
        };
      }

      if (form.includeMedicine) {
        const dose = Number(form.medicineDose);
        const med = medicines.find((m) => m.id === form.medicineId);
        const medicineName = form.medicineName.trim() || med?.name || "";
        if (!medicineName || !Number.isFinite(dose) || dose <= 0) {
          throw new Error(tErrMedicine);
        }
        body.medicine = {
          medicineId: form.medicineId || undefined,
          medicineName,
          dose,
          doseUnit: form.medicineDoseUnit,
          route: form.medicineRoute,
          diseaseOrReason: form.medicineReason || undefined,
          notes: form.medicineNotes || undefined,
        };
      }

      const r = await fetch(`${API_BASE_URL}/api/vet-logs`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? tErrSave);

      setForm(resetFormState());
      closeLog();
      void loadLogs();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:vet-visit-submitted", { detail: { flockId } }));
      }
      setSubmitStage("success");
      showToast(
        "success",
        needsManagerReview ? tSubmittedReview : tSuccess
      );
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : tErrSave;
      setFieldError(msg);
      showToast("error", msg);
      setSubmitStage("idle");
    } finally {
      setBusy(false);
    }
  }

  const stepLabels = [tStepFlock, tStepHouse, tStepMortality, tStepClinical, tStepExtras];

  if (submitStage === "submitting" || submitStage === "success") {
    return (
      <SubmissionStageScreen
        stage={submitStage === "submitting" ? "submitting" : "success"}
        successText={tSuccess}
      />
    );
  }

  if (logOpen && pageState === "ready") {
    return (
      <>
        <FieldStepSheet
          title={tCreate}
          backLabel={tBack}
          onBack={() => (step > 1 ? setStep(step - 1) : closeLog())}
          step={step}
          totalSteps={5}
          stepLabel={stepLabels[step - 1]}
          onNext={step < 5 ? () => setStep(step + 1) : undefined}
          nextLabel={tNext}
          nextDisabled={!canAdvanceFromStep(step)}
          submitLabel={needsManagerReview ? tSubmitReview : tSave}
          submittingLabel={tSaving}
          busy={busy}
          onSubmit={() => void handleSubmit()}
          submitDisabled={!canAdvanceFromStep(4) || !mortalityReviewValid}
        >
          {step === 1 ? (
            <>
              <FlockScopeSelector flocks={flocks} flockId={flockId} onChange={setFlockId} label={tFlock} />
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tLogDate}
                <input
                  type="date"
                  className="mt-1 w-full min-h-[48px] rounded-xl border border-[var(--border-input)] px-3 text-base"
                  value={form.logDate}
                  onChange={(e) => setForm((f) => ({ ...f, logDate: e.target.value }))}
                />
              </label>
              <SegmentedControl
                variant="grid"
                label={tVisitSlot}
                value={visitSlot}
                onChange={(v) => setVisitSlot(v as "am" | "pm" | "spot")}
                options={[
                  { value: "am", label: tAm },
                  { value: "pm", label: tPm },
                  { value: "spot", label: tSpot },
                ]}
              />
            </>
          ) : null}

          {step === 2 ? (
            <HouseRoundStep
              state={houseRound}
              onChange={(patch) => setHouseRound((prev) => ({ ...prev, ...patch }))}
              minPhotos={status?.photosRequiredPerRound ?? 1}
              busy={busy}
            />
          ) : null}

          {step === 3 && flockId ? (
            <VetLogMortalityReviewSection
              token={token ?? ""}
              flockId={flockId}
              logDate={form.logDate}
              onChange={handleMortalityReviewChange}
            />
          ) : null}

          {step === 4 ? (
            <>
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tObservations}
                <Textarea
                  className="mt-1"
                  rows={4}
                  value={form.observations}
                  onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                />
              </label>
              {showClinicalExtra ? (
                <>
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    {tActionsTaken}
                    <Textarea
                      className="mt-1"
                      rows={2}
                      value={form.actionsTaken}
                      onChange={(e) => setForm((f) => ({ ...f, actionsTaken: e.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    {tRecommendations}
                    <Textarea
                      className="mt-1"
                      rows={2}
                      value={form.recommendations}
                      onChange={(e) => setForm((f) => ({ ...f, recommendations: e.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowClinicalExtra(true)}>
                  {tShowClinicalExtra}
                </Button>
              )}
            </>
          ) : null}

          {step === 5 ? (
            <>
              <SegmentedControl
                variant="grid"
                label={tWeightSample}
                value={form.includeWeight ? "yes" : "no"}
                onChange={(v) => setForm((f) => ({ ...f, includeWeight: v === "yes" }))}
                options={[
                  { value: "no", label: tNo },
                  { value: "yes", label: tYes },
                ]}
              />
              {form.includeWeight ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    {tBirdsWeighed}
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
                      value={form.sampleSize}
                      onChange={(e) => setForm((f) => ({ ...f, sampleSize: e.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">
                    {tAvgWeight}
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      className="mt-1 w-full min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
                      value={form.avgWeightKg}
                      onChange={(e) => setForm((f) => ({ ...f, avgWeightKg: e.target.value }))}
                    />
                  </label>
                </div>
              ) : null}

              <SegmentedControl
                variant="grid"
                label={tIncludeMedicine}
                value={form.includeMedicine ? "yes" : "no"}
                onChange={(v) => setForm((f) => ({ ...f, includeMedicine: v === "yes" }))}
                options={[
                  { value: "no", label: tNo },
                  { value: "yes", label: tYes },
                ]}
              />
              {form.includeMedicine ? (
                <div className="space-y-3">
                  <select
                    className="w-full min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
                    value={form.medicineId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const med = medicines.find((m) => m.id === id);
                      setForm((f) => ({
                        ...f,
                        medicineId: id,
                        medicineName: med?.name ?? f.medicineName,
                        medicineDoseUnit: med?.unit ?? f.medicineDoseUnit,
                      }));
                    }}
                  >
                    <option value="">{tManualEntry}</option>
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
                    placeholder={tMedicineName}
                    value={form.medicineName}
                    onChange={(e) => setForm((f) => ({ ...f, medicineName: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder={tDose}
                      className="min-h-[48px] rounded-xl border border-[var(--border-input)] px-3"
                      value={form.medicineDose}
                      onChange={(e) => setForm((f) => ({ ...f, medicineDose: e.target.value }))}
                    />
                    <Select
                      value={form.medicineDoseUnit}
                      onChange={(e) => setForm((f) => ({ ...f, medicineDoseUnit: e.target.value }))}
                    >
                      {medicineDoseUnitOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Select
                    value={form.medicineRoute}
                    onChange={(e) => setForm((f) => ({ ...f, medicineRoute: e.target.value }))}
                  >
                    {medicineRouteOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </>
          ) : null}

          {fieldError ? (
            <p className="text-sm text-[var(--status-danger)]" role="alert">
              {fieldError}
            </p>
          ) : null}
        </FieldStepSheet>

        <SubmissionReportModal open={reportOpen} onClose={() => setReportOpen(false)}>
          {reportLoading ? (
            <div className="p-8"><SkeletonList rows={4} /></div>
          ) : reportLog ? (
            <VetLogReport log={reportLog} onClose={() => setReportOpen(false)} />
          ) : null}
        </SubmissionReportModal>
      </>
    );
  }

  if (historyOpen && pageState !== "loading") {
    return (
      <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
        <FieldPageHeader title={tHistory} variant="history" backTo={companyHref("/farm/vet-logs")} showAccount />

        <FieldFilterBar>
          <input
            className="min-h-[48px] w-full rounded-xl border border-[var(--border-input)] px-3 text-base"
            placeholder={tSearchKeywords}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          <FlockScopeSelector
            flocks={flocks}
            flockId={flockId}
            onChange={setFlockId}
            allowAll
          />
          <SegmentedControl
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: tAll },
              { value: "pending_review", label: tPending },
              { value: "approved", label: tApproved },
              { value: "rejected", label: tRejected },
            ]}
          />
        </FieldFilterBar>

        {historyLoading ? <SkeletonList rows={4} /> : null}
        {!historyLoading ? (
          <FieldHistoryList
            items={historyLogs.map((l) => ({
              id: l.id,
              primary: formatFieldDateTime(l.logDate),
              meta: `${l.authorName ?? "Vet"} · ${l.observations?.slice(0, 60) ?? ""}`,
              onClick: () => void openReport(l.id),
            }))}
            emptyText={tNoRecent}
          />
        ) : null}

        <SubmissionReportModal open={reportOpen} onClose={() => setReportOpen(false)}>
          {reportLoading ? (
            <div className="p-8"><SkeletonList rows={4} /></div>
          ) : reportLog ? (
            <VetLogReport log={reportLog} onClose={() => setReportOpen(false)} />
          ) : null}
        </SubmissionReportModal>
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
          message={ctxError ?? logsError ?? ""}
          onRetry={() => {
            void loadFlocks();
            void loadLogs();
          }}
        />
      ) : null}

      {pageState === "no_flocks" ? (
        <FieldBlockedScreen
          title={tNoFlockTitle}
          description={tNoFlockBody}
          icon={<Stethoscope className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
          action={
            <Button type="button" size="field" className="w-full" onClick={() => navigate(companyHref("/dashboard/vet"))}>
              {tGoHome}
            </Button>
          }
        />
      ) : null}

      {pageState === "ready" && !flockId ? (
        <FieldBlockedScreen
          title={tNoFlockTitle}
          description={tNoFlockBody}
          icon={<Stethoscope className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
          action={
            flocks.length > 1 ? (
              <FlockScopeSelector flocks={flocks} flockId={flockId} onChange={setFlockId} label={tFlock} />
            ) : (
              <Button type="button" size="field" className="w-full" onClick={() => navigate(companyHref("/dashboard/vet"))}>
                {tGoHome}
              </Button>
            )
          }
        />
      ) : null}

      {pageState === "ready" && flockId ? (
        <>
          <FieldFlockContextBar
            flocks={flocks}
            flockId={flockId}
            onFlockChange={setFlockId}
            flockLabel={tFlock}
            flockLabelText={
              status?.label ?? (flockId ? flocks.find((f) => f.id === flockId)?.label ?? flockId : undefined)
            }
            loading={Boolean(flockId && !status && detailLoading)}
            metrics={buildFlockPassportMetrics(
              status,
              performance,
              { day: tDay, liveBirds: tLiveBirds },
              fcrMetric ? `${tFCR} ${fcrMetric}` : undefined
            )}
          />

          <FieldTaskHub
            {...hubTeaching}
            primaryAction={
              <Button type="button" size="field" className="w-full" onClick={openLog}>
                {tCreate}
              </Button>
            }
          >
            {logsError ? <p className="text-sm text-[var(--status-warning)]">{logsError}</p> : null}
            <FieldHistoryList
              title={tRecent}
              items={logs.slice(0, 3).map((l) => ({
                id: l.id,
                primary: formatFieldDateTime(l.logDate),
                meta: `${l.submissionStatus}${l.observations ? ` · ${l.observations.slice(0, 40)}` : ""}`,
                onClick: () => void openReport(l.id),
              }))}
              emptyText={tNoRecent}
            />
          </FieldTaskHub>
        </>
      ) : null}

      <SubmissionReportModal open={reportOpen} onClose={() => setReportOpen(false)}>
        {reportLoading ? (
          <div className="p-8"><SkeletonList rows={4} /></div>
        ) : reportLog ? (
          <VetLogReport log={reportLog} onClose={() => setReportOpen(false)} />
        ) : null}
      </SubmissionReportModal>
    </div>
  );
}
