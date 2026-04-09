import { useLaborerT } from "../../i18n/laborerI18n";
import { DailyLogForm, type DailyLogPayload } from "../../components/DailyLogForm";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";

export function FarmDailyLogPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const savedMsg = useLaborerT("Daily log saved.");
  const pageTitle = useLaborerT("Daily log");
  const pageSub = useLaborerT("Large fields for quick coop entry.");
  const lblFlock = useLaborerT("Flock");

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error,
    loadFlocks,
    loadDetails,
  } = useFlockFieldContext(token);

  const loading = listLoading;
  const selected = flocks.find((f) => f.id === flockId);
  const initialCount = Math.max(1, Number(selected?.initialCount) || 1);

  async function postDailyLog(payload: DailyLogPayload) {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/daily-logs`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? `Save failed (${res.status})`);
    }
    return data as { ok: boolean; record?: unknown; payrollImpact?: { rwfDelta?: number } };
  }

  async function validateDailyLog(payload: DailyLogPayload) {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/api/daily-logs/validate`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? `Validate failed (${res.status})`);
    }
    return data as { warnings: string[] };
  }

  return (
    <div className="space-y-4">
      <PageHeader title={pageTitle} subtitle={pageSub} />

      {loading && <SkeletonList rows={2} />}
      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
          }}
        />
      )}

      {!loading && !error ? (
        <>
          <label className="block text-sm font-medium text-neutral-700">
            {lblFlock}
            <select
              className="mt-1 w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base"
              value={flockId}
              onChange={(e) => setFlockId(e.target.value)}
            >
              {flocks.length === 0 ? <option value="">No flocks</option> : null}
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {status ? (
            <FlockContextStrip
              label={status.label}
              code={selected?.code}
              placementDate={status.placementDate}
              ageDays={status.ageDays}
              feedToDateKg={status.feedToDateKg}
              initialCount={selected?.initialCount}
              birdsLiveEstimate={performance?.birdsLiveEstimate}
              verifiedLiveCount={performance?.verifiedLiveCount}
              mortalityToDate={performance?.mortalityToDate}
            />
          ) : flockId && detailLoading ? (
            <SkeletonList rows={2} />
          ) : flockId ? (
            <p className="text-sm text-neutral-500">Loading context…</p>
          ) : null}

          {flockId ? (
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <DailyLogForm
                flockId={flockId}
                initialFlockCount={initialCount}
                onValidate={validateDailyLog}
                onSubmit={async (payload) => {
                  try {
                    const out = await postDailyLog(payload);
                    void loadDetails();
                    const pay = out.payrollImpact;
                    const bonus =
                      pay != null && typeof pay.rwfDelta === "number"
                        ? ` (${pay.rwfDelta >= 0 ? "+" : ""}${pay.rwfDelta} RWF)`
                        : "";
                    showToast("success", `${savedMsg}${bonus}`);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Save failed";
                    showToast("error", msg);
                    throw e;
                  }
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-amber-900">Create a flock before submitting daily logs.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
