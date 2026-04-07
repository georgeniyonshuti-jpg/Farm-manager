import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders, jsonAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";

type Flock = { id: string; label: string };
type Treatment = {
  id: string;
  at: string;
  diseaseOrReason: string;
  medicineName: string;
  dose: number;
  doseUnit: string;
  route: string;
  durationDays: number;
  withdrawalDays: number;
  notes: string;
};

export function FarmTreatmentPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [flockId, setFlockId] = useState("");
  const [rows, setRows] = useState<Treatment[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    diseaseOrReason: "",
    medicineName: "",
    dose: "",
    doseUnit: "ml",
    route: "oral",
    durationDays: "1",
    withdrawalDays: "0",
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
      const flock = flocks.find((f) => f.id === flockId);
      void flock;
      setStartAt("");
      setEndAt(new Date().toISOString().slice(0, 10));
    },
  }), [flocks, flockId]);

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
      if (!selected) {
        setRows([]);
        return;
      }
      const q = new URLSearchParams();
      if (startAt) q.set("start_at", `${startAt}T00:00:00.000Z`);
      if (endAt) q.set("end_at", `${endAt}T23:59:59.999Z`);
      const tr = await fetch(`${API_BASE_URL}/api/flocks/${selected}/treatments?${q.toString()}`, {
        headers: readAuthHeaders(token),
      });
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.error ?? "Failed to load treatments");
      setRows((td.treatments as Treatment[]) ?? []);
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
      const r = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/treatments`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          ...form,
          dose: Number(form.dose),
          durationDays: Number(form.durationDays),
          withdrawalDays: Number(form.withdrawalDays),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      showToast("success", "Treatment logged.");
      setForm((v) => ({ ...v, diseaseOrReason: "", medicineName: "", dose: "", notes: "" }));
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Medicine tracking" subtitle="Record treatments and withdrawal windows by flock." />
      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error ? (
        <>
          <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={flockId} onChange={(e) => setFlockId(e.target.value)}>
                {flocks.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Disease / reason" value={form.diseaseOrReason} onChange={(e) => setForm((v) => ({ ...v, diseaseOrReason: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Medicine name" value={form.medicineName} onChange={(e) => setForm((v) => ({ ...v, medicineName: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Dose" inputMode="decimal" value={form.dose} onChange={(e) => setForm((v) => ({ ...v, dose: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Dose unit (ml, g...)" value={form.doseUnit} onChange={(e) => setForm((v) => ({ ...v, doseUnit: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Route (oral, injection...)" value={form.route} onChange={(e) => setForm((v) => ({ ...v, route: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Duration days" inputMode="numeric" value={form.durationDays} onChange={(e) => setForm((v) => ({ ...v, durationDays: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Withdrawal days" inputMode="numeric" value={form.withdrawalDays} onChange={(e) => setForm((v) => ({ ...v, withdrawalDays: e.target.value }))} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={preset.set7d} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">Last 7d</button>
              <button type="button" onClick={preset.set30d} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">Last 30d</button>
              <button type="button" onClick={preset.setCycle} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">Cycle to date</button>
            </div>
            <textarea className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2" rows={3} placeholder="Notes" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
            <div className="mt-3 flex justify-end gap-2">
              <a
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                href={`${API_BASE_URL}/api/reports/treatments.csv?flock_id=${encodeURIComponent(flockId)}${startAt ? `&start_at=${encodeURIComponent(`${startAt}T00:00:00.000Z`)}` : ""}${endAt ? `&end_at=${encodeURIComponent(`${endAt}T23:59:59.999Z`)}` : ""}`}
                target="_blank"
                rel="noreferrer"
              >
                Download CSV
              </a>
              <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit">{busy ? "Saving..." : "Save treatment"}</button>
            </div>
          </form>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-neutral-800">Recent treatments</p>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <p className="font-medium">{r.medicineName} - {r.diseaseOrReason}</p>
                  <p className="text-neutral-600">{r.dose} {r.doseUnit} via {r.route}, withdrawal {r.withdrawalDays} day(s)</p>
                  <p className="text-xs text-neutral-500">
                    {(() => {
                      const endsAt = new Date(new Date(r.at).getTime() + r.withdrawalDays * 24 * 60 * 60 * 1000).getTime();
                      const leftDays = Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000));
                      return leftDays > 0 ? `Withdrawal active: ${leftDays} day(s) left` : "Withdrawal cleared";
                    })()}
                  </p>
                </div>
              ))}
              {!rows.length ? <p className="text-sm text-neutral-500">No treatments yet.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
