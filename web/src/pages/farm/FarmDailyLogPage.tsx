import { DailyLogForm, type DailyLogPayload } from "../../components/DailyLogForm";
import { useAuth } from "../../auth/AuthContext";
import { useLaborerT } from "../../i18n/laborerI18n";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";

/** Demo API flock id — matches server seed + payroll log_schedule */
const DEMO_FLOCK_ID = "flock_demo_001";
const DEMO_INITIAL_COUNT = 1000;

export function FarmDailyLogPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const savedMsg = useLaborerT("Daily log saved.");
  const pageTitle = useLaborerT("Daily log");
  const pageSub = useLaborerT("Large fields for quick coop entry.");

  async function postDailyLog(payload: DailyLogPayload) {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/daily-logs", {
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

    const res = await fetch("/api/daily-logs/validate", {
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
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <DailyLogForm
          flockId={DEMO_FLOCK_ID}
          initialFlockCount={DEMO_INITIAL_COUNT}
          onValidate={validateDailyLog}
          onSubmit={async (payload) => {
            try {
              const out = await postDailyLog(payload);
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
    </div>
  );
}
