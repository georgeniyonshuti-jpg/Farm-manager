import React, { useCallback, useMemo, useState } from "react";
import { TranslatedText, useLaborerT } from "../i18n/laborerI18n";

/**
 * Mobile-first daily log for laborers ("Coop View").
 * Pair with API that applies sanity rules: e.g. mortality / initial_count >= 0.005 → red alert;
 * extreme mortality → vet_approval_required before P&L inclusion.
 */
export type DailyLogPayload = {
  flockId: string;
  logDate: string;
  mortality: number;
  feedIntakeKg: number;
  waterLiters: number;
  tempMinC: number | null;
  tempMaxC: number | null;
  avgWeightSampleKg: number | null;
  notes: string;
};

export type DailyLogFormProps = {
  flockId: string;
  initialFlockCount: number;
  defaultDate?: string;
  onSubmit: (payload: DailyLogPayload) => Promise<void>;
  /** Server may return warnings after dry-run validation */
  onValidate?: (payload: DailyLogPayload) => Promise<{ warnings: string[] } | void>;
};

const inputClassBase =
  "w-full min-h-[48px] rounded-xl border bg-white px-4 text-lg shadow-sm focus:outline-none focus:ring-2";
const inputClassNormal = `${inputClassBase} border-neutral-300 focus:border-emerald-600 focus:ring-emerald-500/40`;
const inputClassError = `${inputClassBase} border-red-500 focus:border-red-600 focus:ring-red-500/40`;
const labelClass = "mb-1 block text-sm font-medium text-neutral-700";
const btnPrimary =
  "inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-neutral-300 bg-neutral-50 px-4 text-lg font-semibold text-neutral-800 active:scale-[0.99]";

function DailyLogRedAlert({ mortalityPct }: { mortalityPct: number }) {
  const title = useLaborerT("Red alert");
  const body = useLaborerT(
    `Mortality is ${mortalityPct.toFixed(2)}% of initial flock (≥ 0.5% today). A vet manager may need to approve before this day counts toward P&L.`
  );
  return (
    <div
      className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-900"
      role="status"
    >
      <p className="font-semibold">{title}</p>
      <p className="text-sm">{body}</p>
    </div>
  );
}

function DailyLogExtremeAlert() {
  const title = useLaborerT("Sanity check");
  const body = useLaborerT(
    "Very high mortality for one day. Submission may be held for vet manager approval."
  );
  return (
    <div className="rounded-xl border border-red-400 bg-red-50 p-4 text-red-900" role="alert">
      <p className="font-semibold">{title}</p>
      <p className="text-sm">{body}</p>
    </div>
  );
}

function WarningLine({ text }: { text: string }) {
  const t = useLaborerT(text);
  return <li>{t}</li>;
}

export function DailyLogForm({
  flockId,
  initialFlockCount,
  defaultDate,
  onSubmit,
  onValidate,
}: DailyLogFormProps) {
  const labelDate = useLaborerT("Date");
  const labelMortality = useLaborerT("Mortality (birds)");
  const labelFeed = useLaborerT("Feed (kg)");
  const labelWater = useLaborerT("Water (L)");
  const labelTmin = useLaborerT("Min °C");
  const labelTmax = useLaborerT("Max °C");
  const labelAvg = useLaborerT("Avg weight sample (kg)");
  const phOptional = useLaborerT("Optional");
  const labelNotes = useLaborerT("Notes");
  const btnCheck = useLaborerT("Check entries");
  const btnSaving = useLaborerT("Saving…");
  const btnSave = useLaborerT("Save daily log");
  const phZero = useLaborerT("0");
  const errValidation = useLaborerT("Validation failed");
  const errSave = useLaborerT("Could not save log");
  const errRequired = useLaborerT("This field is required.");
  const errDateFuture = useLaborerT("Date cannot be in the future.");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [logDate, setLogDate] = useState(defaultDate ?? today);
  const [mortality, setMortality] = useState(0);
  const [feedKg, setFeedKg] = useState("");
  const [waterL, setWaterL] = useState("");
  const [tempMin, setTempMin] = useState("");
  const [tempMax, setTempMax] = useState("");
  const [avgWeight, setAvgWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const mortalityPct =
    initialFlockCount > 0 ? (Number(mortality || 0) / initialFlockCount) * 100 : 0;
  const redAlert = mortalityPct >= 0.5;
  const extremeMortality = mortalityPct >= 2;

  const buildPayload = useCallback((): DailyLogPayload => {
    const parseOpt = (s: string) => (s.trim() === "" ? null : Number(s));
    return {
      flockId,
      logDate,
      mortality: Number(mortality || 0),
      feedIntakeKg: Number(feedKg || 0),
      waterLiters: Number(waterL || 0),
      tempMinC: parseOpt(tempMin),
      tempMaxC: parseOpt(tempMax),
      avgWeightSampleKg: parseOpt(avgWeight),
      notes: notes.trim(),
    };
  }, [avgWeight, feedKg, flockId, logDate, mortality, notes, tempMax, tempMin, waterL]);

  const handleValidate = async () => {
    setError(null);
    if (!onValidate) return;
    try {
      const res = await onValidate(buildPayload());
      setWarnings(res?.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : errValidation);
    }
  };

  const dateInvalid = submitAttempted && (!logDate || logDate > today);
  const feedInvalid = submitAttempted && feedKg.trim() === "";
  const waterInvalid = submitAttempted && waterL.trim() === "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setError(null);
    if (!logDate || logDate > today) return;
    if (feedKg.trim() === "" || waterL.trim() === "") return;
    setBusy(true);
    try {
      await onSubmit(buildPayload());
    } catch (err) {
      setError(err instanceof Error ? err.message : errSave);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg touch-manipulation space-y-5 px-4 py-6">
      {redAlert && <DailyLogRedAlert mortalityPct={mortalityPct} />}

      {extremeMortality && <DailyLogExtremeAlert />}

      <div>
        <label className={labelClass} htmlFor="logDate">
          {labelDate}
        </label>
        <input
          id="logDate"
          type="date"
          max={today}
          aria-invalid={dateInvalid}
          className={dateInvalid ? inputClassError : inputClassNormal}
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          required
        />
        {dateInvalid ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {!logDate ? errRequired : errDateFuture}
          </p>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="mortality">
          {labelMortality}
        </label>
        <input
          id="mortality"
          inputMode="numeric"
          className={inputClassNormal}
          value={mortality === 0 ? "" : mortality}
          placeholder={phZero}
          onChange={(e) =>
            setMortality(e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))
          }
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="feed">
          {labelFeed}
        </label>
        <input
          id="feed"
          inputMode="decimal"
          aria-invalid={feedInvalid}
          className={feedInvalid ? inputClassError : inputClassNormal}
          value={feedKg}
          placeholder={phZero}
          onChange={(e) => setFeedKg(e.target.value)}
        />
        {feedInvalid ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {errRequired}
          </p>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="water">
          {labelWater}
        </label>
        <input
          id="water"
          inputMode="decimal"
          aria-invalid={waterInvalid}
          className={waterInvalid ? inputClassError : inputClassNormal}
          value={waterL}
          placeholder={phZero}
          onChange={(e) => setWaterL(e.target.value)}
        />
        {waterInvalid ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {errRequired}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="tmin">
            {labelTmin}
          </label>
          <input
            id="tmin"
            inputMode="decimal"
            className={inputClassNormal}
            value={tempMin}
            onChange={(e) => setTempMin(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tmax">
            {labelTmax}
          </label>
          <input
            id="tmax"
            inputMode="decimal"
            className={inputClassNormal}
            value={tempMax}
            onChange={(e) => setTempMax(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="avgw">
          {labelAvg}
        </label>
        <input
          id="avgw"
          inputMode="decimal"
          className={inputClassNormal}
          value={avgWeight}
          placeholder={phOptional}
          onChange={(e) => setAvgWeight(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="notes">
          {labelNotes}
        </label>
        <textarea
          id="notes"
          className={`${inputClassNormal} min-h-[96px] py-3`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {warnings.map((w) => (
            <WarningLine key={w} text={w} />
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          <TranslatedText text={error} />
        </p>
      )}

      <div className="flex flex-col gap-3 pt-2">
        {onValidate && (
          <button type="button" className={btnSecondary} onClick={handleValidate} disabled={busy}>
            {btnCheck}
          </button>
        )}
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? btnSaving : btnSave}
        </button>
      </div>
    </form>
  );
}
