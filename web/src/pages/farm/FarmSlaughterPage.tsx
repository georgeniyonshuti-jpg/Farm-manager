import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { API_BASE_URL } from "../../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";

type Flock = { id: string; label: string };
type Slaughter = {
  id: string;
  at: string;
  reasonCode?: string;
  birdsSlaughtered: number;
  avgLiveWeightKg: number;
  avgCarcassWeightKg: number | null;
  notes: string;
};
type PerformanceSummary = {
  feedToDateKg: number;
  birdsLiveEstimate: number;
  mortalityToDate: number;
  fcr: number | null;
};

const SLAUGHTER_REASON_OPTIONS = [
  { value: "planned_market", label: "Planned market harvest" },
  { value: "target_weight_reached", label: "Target weight reached" },
  { value: "emergency_cull", label: "Emergency cull" },
  { value: "partial_harvest", label: "Partial harvest" },
  { value: "other", label: "Other" },
];

function slaughterReasonLabel(row: Slaughter): string {
  const source = row.reasonCode ?? row.notes;
  return SLAUGHTER_REASON_OPTIONS.find((r) => r.value === source)?.label ?? row.notes;
}

export function FarmSlaughterPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [flockId, setFlockId] = useState("");
  const [rows, setRows] = useState<Slaughter[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    reasonCode: "planned_market",
    birdsSlaughtered: "",
    avgLiveWeightKg: "",
    avgCarcassWeightKg: "",
    notes: "",
  });

  const preset = useMemo(() => ({
    set7d: () => {
      const end = new Date();
      const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      setStartAt(start.toISOString().slice(0, 10));
      setEndAt(end.toISOString().slice(0, 10));
    },
    set30d: () => {
      const end = new Date();
      const start = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      setStartAt(start.toISOString().slice(0, 10));
      setEndAt(end.toISOString().slice(0, 10));
    },
    setCycle: () => {
      setStartAt("");
      setEndAt(new Date().toISOString().slice(0, 10));
    },
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Failed to load flocks");
      const f = (fd.flocks as Flock[]) ?? [];
      setFlocks(f);
      const selected = flockId || f[0]?.id || "";
      setFlockId(selected);
      if (!selected) return;

      const q = new URLSearchParams();
      if (startAt) q.set("start_at", `${startAt}T00:00:00.000Z`);
      if (endAt) q.set("end_at", `${endAt}T23:59:59.999Z`);
      const [sr, pr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${selected}/slaughter-events?${q.toString()}`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/flocks/${selected}/performance-summary`, { headers: readAuthHeaders(token) }),
      ]);
      const sd = await sr.json();
      const pd = await pr.json();
      if (!sr.ok) throw new Error(sd.error ?? "Failed to load slaughter events");
      if (!pr.ok) throw new Error(pd.error ?? "Failed to load summary");
      setRows((sd.slaughterEvents as Slaughter[]) ?? []);
      setSummary(pd as PerformanceSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, flockId, startAt, endAt]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/slaughter-events`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          ...form,
          birdsSlaughtered: Number(form.birdsSlaughtered),
          avgLiveWeightKg: Number(form.avgLiveWeightKg),
          avgCarcassWeightKg: form.avgCarcassWeightKg ? Number(form.avgCarcassWeightKg) : null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const payload = d as { error?: string; activeMedicines?: Array<{ medicineName?: string }> };
        if (Array.isArray(payload.activeMedicines) && payload.activeMedicines.length > 0) {
          const names = payload.activeMedicines
            .map((x) => x.medicineName)
            .filter((x): x is string => Boolean(x))
            .join(", ");
          throw new Error(`${payload.error ?? "Save failed"} Active: ${names}`);
        }
        throw new Error(payload.error ?? "Save failed");
      }
      showToast("success", "Slaughter record saved.");
      setForm((v) => ({ ...v, birdsSlaughtered: "", avgLiveWeightKg: "", avgCarcassWeightKg: "", notes: "" }));
      await load();
    } catch (e) {
      const d = e instanceof Error ? e.message : "Save failed";
      showToast("error", d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Slaughter and FCR" subtitle="Capture slaughter metrics and monitor feed conversion ratio." />
      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">Feed to date</p><p className="font-semibold">{summary?.feedToDateKg ?? 0} kg</p></div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">Live estimate</p><p className="font-semibold">{summary?.birdsLiveEstimate ?? 0}</p></div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">Mortality</p><p className="font-semibold">{summary?.mortalityToDate ?? 0}</p></div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">FCR</p><p className="font-semibold">{summary?.fcr != null ? summary.fcr.toFixed(2) : "-"}</p></div>
          </div>

          <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={flockId} onChange={(e) => setFlockId(e.target.value)}>
                {flocks.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.reasonCode} onChange={(e) => setForm((v) => ({ ...v, reasonCode: e.target.value }))}>
                {SLAUGHTER_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Birds slaughtered" inputMode="numeric" value={form.birdsSlaughtered} onChange={(e) => setForm((v) => ({ ...v, birdsSlaughtered: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Avg live weight (kg)" inputMode="decimal" value={form.avgLiveWeightKg} onChange={(e) => setForm((v) => ({ ...v, avgLiveWeightKg: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Avg carcass weight (kg, optional)" inputMode="decimal" value={form.avgCarcassWeightKg} onChange={(e) => setForm((v) => ({ ...v, avgCarcassWeightKg: e.target.value }))} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={preset.set7d} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">Last 7d</button>
              <button type="button" onClick={preset.set30d} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">Last 30d</button>
              <button type="button" onClick={preset.setCycle} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">Cycle to date</button>
            </div>
            <textarea className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2" rows={3} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
            <div className="mt-3 flex justify-end gap-2">
              <a className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" href={`${API_BASE_URL}/api/reports/slaughter.csv?flock_id=${encodeURIComponent(flockId)}${startAt ? `&start_at=${encodeURIComponent(`${startAt}T00:00:00.000Z`)}` : ""}${endAt ? `&end_at=${encodeURIComponent(`${endAt}T23:59:59.999Z`)}` : ""}`} target="_blank" rel="noreferrer">Slaughter CSV</a>
              <a className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" href={`${API_BASE_URL}/api/reports/flock-performance.csv?flock_id=${encodeURIComponent(flockId)}${endAt ? `&end_at=${encodeURIComponent(`${endAt}T23:59:59.999Z`)}` : ""}`} target="_blank" rel="noreferrer">Performance CSV</a>
              <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit">{busy ? "Saving..." : "Save slaughter"}</button>
            </div>
          </form>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-neutral-800">Recent slaughter records</p>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <p className="font-medium">
                    {r.birdsSlaughtered} birds - {r.avgLiveWeightKg} kg live avg
                  </p>
                  <p className="text-neutral-600">{slaughterReasonLabel(r)}</p>
                  <p className="text-neutral-600">
                    {new Date(r.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  </p>
                </div>
              ))}
              {!rows.length ? <p className="text-sm text-neutral-500">No slaughter records yet.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
