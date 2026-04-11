import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../auth/types";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";

type Schedule = {
  id: string;
  flockId: string;
  role: string;
  intervalHours: number;
  windowOpen: string;
  windowClose: string;
  createdAt: string;
};

type FlockRow = { id: string; label: string };

const ROLE_OPTIONS: UserRole[] = [
  "laborer",
  "dispatcher",
  "vet",
  "vet_manager",
  "manager",
  "procurement_officer",
  "sales_coordinator",
];

const FALLBACK_LOG_SCHEDULE_ROLES = ROLE_OPTIONS.map((r) => ({ value: r, label: r }));

export function LogScheduleSettingsPage() {
  const { token } = useAuth();
  const logScheduleRoleOptions = useReferenceOptions("log_schedule_role", token, FALLBACK_LOG_SCHEDULE_ROLES);
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [serverKigali, setServerKigali] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [formFlock, setFormFlock] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("laborer");
  const [formInterval, setFormInterval] = useState("8");
  const [formOpen, setFormOpen] = useState("06:00");
  const [formClose, setFormClose] = useState("20:00");

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [tf, ts] = await Promise.all([
        // ENV: moved to environment variable
        fetch(`${API_BASE_URL}/api/server-time`, { headers: readAuthHeaders(token) }).then((r) => r.json()),
        // ENV: moved to environment variable
        fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) }).then((r) => r.json()),
      ]);
      setServerKigali(String((tf as { kigali?: string }).kigali ?? ""));

      if (!(ts as { flocks?: FlockRow[] }).flocks) throw new Error((ts as { error?: string }).error ?? "Flocks failed");
      const fl = (ts as { flocks: FlockRow[] }).flocks;
      setFlocks(fl.map((f) => ({ id: f.id, label: String(f.label ?? f.id) })));

      const allSched: Schedule[] = [];
      for (const f of fl) {
        // ENV: moved to environment variable
        const r = await fetch(`${API_BASE_URL}/api/log-schedule/${f.id}`, { headers: readAuthHeaders(token) });
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error);
        for (const s of (d.schedules as Schedule[]) ?? []) allSched.push(s);
      }
      setSchedules(allSched);
      setFormFlock((prev) => {
        if (prev && fl.some((x) => x.id === prev)) return prev;
        return fl[0]?.id ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const grouped = flocks.map((f) => ({
    flock: f,
    rows: schedules.filter((s) => s.flockId === f.id),
  }));

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!formFlock) return;
    setBusy(true);
    setError(null);
    try {
      // ENV: moved to environment variable
      const res = await fetch(`${API_BASE_URL}/api/log-schedule`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          flockId: formFlock,
          role: formRole,
          intervalHours: Number(formInterval),
          windowOpen: formOpen,
          windowClose: formClose,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setPanelOpen(false);
      await loadAll();
      showToast("success", "Schedule saved.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSchedule(id: string) {
    if (!window.confirm("Delete this schedule?")) return;
    setBusy(true);
    try {
      // ENV: moved to environment variable
      const res = await fetch(`${API_BASE_URL}/api/log-schedule/${id}`, {
        method: "DELETE",
        headers: readAuthHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error);
      await loadAll();
      showToast("success", "Schedule removed.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Log schedule (payroll windows)"
        subtitle="On-time submissions inside the window earn +500 RWF; outside window −300 RWF (demo rates)."
        action={
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <span className="font-semibold">Server time (Kigali): </span>
            {serverKigali || "—"}
          </div>
        }
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => setPanelOpen(true)}
        className="rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
      >
        Add schedule
      </button>

      {loading && <SkeletonList rows={3} />}
      {error && <ErrorState message={error} onRetry={() => void loadAll()} />}

      {!loading &&
        !error &&
        grouped.map(({ flock, rows }) => (
          <section key={flock.id} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <h2 className="border-b border-neutral-100 px-4 py-3 text-lg font-semibold text-neutral-900">
              {flock.label}
            </h2>
            {rows.length === 0 ? (
              <div className="px-4 py-4">
                <EmptyState
                  title="No payroll windows yet"
                  description="Add a schedule for this flock to define on-time windows."
                />
              </div>
            ) : (
              <>
                <ul className="space-y-2 px-4 py-3 sm:hidden">
                  {rows.map((s) => (
                    <li key={s.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                      <p className="font-medium text-neutral-900">{s.role}</p>
                      <p className="mt-1 text-neutral-600">
                        Every {s.intervalHours} h ·{" "}
                        <span className="font-mono">
                          {s.windowOpen} – {s.windowClose}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => void deleteSchedule(s.id)}
                        className="mt-2 text-sm font-medium text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="institutional-table-wrapper overflow-x-auto">
                  <table className="institutional-table min-w-[32rem] text-sm">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Interval (h)</th>
                        <th>Window</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.id}>
                          <td>{s.role}</td>
                          <td>{s.intervalHours}</td>
                          <td className="font-mono">
                            {s.windowOpen} – {s.windowClose}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => void deleteSchedule(s.id)}
                              className="text-sm font-medium text-red-700 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ))}

      {panelOpen && (
        <>
          <button
            type="button"
            aria-label="Close panel"
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setPanelOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h2 className="text-lg font-semibold">New log schedule</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                Close
              </button>
            </div>
            <form onSubmit={(e) => void submitSchedule(e)} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Flock</label>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  value={formFlock}
                  onChange={(e) => setFormFlock(e.target.value)}
                  required
                >
                  {flocks.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Role</label>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                >
                  {logScheduleRoleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Interval (hours)</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  value={formInterval}
                  onChange={(e) => setFormInterval(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Window open</label>
                <input
                  type="time"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  value={formOpen}
                  onChange={(e) => setFormOpen(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Window close</label>
                <input
                  type="time"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                  value={formClose}
                  onChange={(e) => setFormClose(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-auto min-h-[48px] rounded-xl bg-emerald-800 font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save schedule"}
              </button>
            </form>
          </aside>
        </>
      )}
    </div>
  );
}
