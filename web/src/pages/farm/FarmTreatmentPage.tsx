import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders, jsonAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import type { CheckinStatus } from "./FarmCheckinPage";

type Flock = { id: string; label: string; code?: string | null };
type Medicine = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  withdrawalDays: number;
  lowStockThreshold: number;
};
type Treatment = {
  id: string;
  at: string;
  reasonCode?: string;
  diseaseOrReason: string;
  medicineName: string;
  dose: number;
  doseUnit: string;
  route: string;
  durationDays: number;
  withdrawalDays: number;
  notes: string;
};
type Round = {
  id: string;
  flockId: string;
  medicineId: string;
  medicineName: string;
  plannedFor: string;
  route: string;
  plannedQuantity: number;
  status: "planned" | "in_progress" | "completed" | "missed" | "cancelled";
  assignedToUserId?: string | null;
};
type OverdueRound = Round & { overdueMinutes: number };
type ForecastRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  totalUsedInWindow: number;
  avgDailyUse: number;
  daysOfCover: number | null;
  stockoutRisk7d: boolean;
};

const TREATMENT_REASON_OPTIONS = [
  { value: "routine_prevention", label: "Routine prevention" },
  { value: "suspected_infection", label: "Suspected infection" },
  { value: "confirmed_infection", label: "Confirmed infection" },
  { value: "vet_directive", label: "Vet directive" },
  { value: "other", label: "Other" },
];

const ROUTE_OPTIONS = ["oral", "injection", "waterline", "spray", "other"];
const DOSE_UNIT_OPTIONS = ["ml", "g", "mg", "tablet", "drop", "other"];

/** Must match `medicine_inventory.unit` CHECK in database migrations. */
const MED_STOCK_UNITS = ["ml", "g", "doses", "sachets"] as const;

type MedTab = "treatments" | "rounds" | "inventory";

function treatmentReasonLabel(row: Treatment): string {
  const source = row.reasonCode ?? row.diseaseOrReason;
  return TREATMENT_REASON_OPTIONS.find((r) => r.value === source)?.label ?? row.diseaseOrReason;
}

export function FarmTreatmentPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [flockId, setFlockId] = useState("");
  const [rows, setRows] = useState<Treatment[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [overdueRounds, setOverdueRounds] = useState<OverdueRound[]>([]);
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    reasonCode: "routine_prevention",
    diseaseOrReason: "",
    medicineName: "",
    dose: "",
    doseUnit: "ml",
    route: "oral",
    durationDays: "1",
    withdrawalDays: "0",
    notes: "",
  });
  const [medForm, setMedForm] = useState({
    name: "",
    category: "vaccine",
    unit: "ml",
    quantity: "",
    withdrawalDays: "0",
    lowStockThreshold: "10",
    supplier: "",
    expiryDate: "",
  });
  const [roundForm, setRoundForm] = useState({
    medicineId: "",
    plannedFor: new Date().toISOString().slice(0, 16),
    route: "drinking_water",
    plannedQuantity: "",
    assignedToUserId: "",
    notes: "",
  });
  const [tab, setTab] = useState<MedTab>("treatments");
  const [flockStrip, setFlockStrip] = useState<CheckinStatus | null>(null);

  useEffect(() => {
    if (!flockId || !token) {
      setFlockStrip(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/checkin-status`, {
          headers: readAuthHeaders(token),
        });
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error ?? "status");
        if (!cancelled) setFlockStrip(d as CheckinStatus);
      } catch {
        if (!cancelled) setFlockStrip(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flockId, token]);

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
      const [fr, mr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/medicine`, { headers: readAuthHeaders(token) }),
      ]);
      const fd = await fr.json();
      const md = await mr.json().catch(() => ({ medicines: [] }));
      if (!fr.ok) throw new Error(fd.error ?? "Failed to load flocks");
      const f = (fd.flocks as Flock[]) ?? [];
      setFlocks(f);
      setMedicines((md.medicines as Medicine[]) ?? []);
      const selected = flockId || f[0]?.id || "";
      setFlockId(selected);
      if (!selected) {
        setRows([]);
        return;
      }
      const q = new URLSearchParams();
      if (startAt) q.set("start_at", `${startAt}T00:00:00.000Z`);
      if (endAt) q.set("end_at", `${endAt}T23:59:59.999Z`);
      const [tr, rr, orr, frs] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${selected}/treatments?${q.toString()}`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/treatment-rounds?flock_id=${encodeURIComponent(selected)}`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/treatment-rounds/overdue?flock_id=${encodeURIComponent(selected)}`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/medicine/forecast?lookback_days=30`, {
          headers: readAuthHeaders(token),
        }),
      ]);
      const td = await tr.json();
      const rd = await rr.json().catch(() => ({ rounds: [] }));
      const od = await orr.json().catch(() => ({ overdueRounds: [] }));
      const fd2 = await frs.json().catch(() => ({ forecast: [] }));
      if (!tr.ok) throw new Error(td.error ?? "Failed to load treatments");
      setRows((td.treatments as Treatment[]) ?? []);
      setRounds((rd.rounds as Round[]) ?? []);
      setOverdueRounds((od.overdueRounds as OverdueRound[]) ?? []);
      setForecastRows((fd2.forecast as ForecastRow[]) ?? []);
      setRoundForm((prev) => ({ ...prev, medicineId: prev.medicineId || ((md.medicines as Medicine[])?.[0]?.id ?? "") }));
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

  async function submitMedicine(e: React.FormEvent) {
    e.preventDefault();
    const name = medForm.name.trim();
    const qty = Number(medForm.quantity);
    const wdays = Number(medForm.withdrawalDays);
    const lowTh = Number(medForm.lowStockThreshold);
    if (!name) {
      showToast("error", "Medicine name is required.");
      return;
    }
    if (!MED_STOCK_UNITS.includes(medForm.unit as (typeof MED_STOCK_UNITS)[number])) {
      showToast("error", "Choose a stock unit allowed by the catalog (ml, g, doses, sachets).");
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      showToast("error", "Enter a valid opening quantity (0 or more).");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/medicine`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          ...medForm,
          name,
          quantity: qty,
          withdrawalDays: Number.isFinite(wdays) ? Math.max(0, wdays) : 0,
          lowStockThreshold: Number.isFinite(lowTh) ? Math.max(0, lowTh) : 10,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to add medicine");
      showToast("success", "Medicine stock item created.");
      setMedForm((v) => ({ ...v, name: "", quantity: "", supplier: "", expiryDate: "" }));
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRound(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId || !roundForm.medicineId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/treatment-rounds`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          flockId,
          medicineId: roundForm.medicineId,
          plannedFor: new Date(roundForm.plannedFor).toISOString(),
          route: roundForm.route,
          plannedQuantity: Number(roundForm.plannedQuantity),
          assignedToUserId: roundForm.assignedToUserId || null,
          notes: roundForm.notes || null,
          checklist: ["confirm_stock", "mixing_done", "distribution_done"],
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to create round");
      showToast("success", "Treatment round scheduled.");
      setRoundForm((v) => ({ ...v, plannedQuantity: "", notes: "" }));
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateRoundStatus(id: string, status: Round["status"]) {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/treatment-rounds/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ status }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", `Round marked ${status}.`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function tabClass(active: boolean) {
    return [
      "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
      active ? "bg-emerald-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
    ].join(" ");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Medicine tracking" subtitle="Record treatments and withdrawal windows by flock." />
      {!loading && flockStrip ? (
        <FlockContextStrip
          label={flockStrip.label}
          code={flocks.find((x) => x.id === flockId)?.code}
          placementDate={flockStrip.placementDate}
          ageDays={flockStrip.ageDays}
          feedToDateKg={flockStrip.feedToDateKg}
        />
      ) : null}
      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
            <button type="button" className={tabClass(tab === "treatments")} onClick={() => setTab("treatments")}>
              Treatments
            </button>
            <button type="button" className={tabClass(tab === "rounds")} onClick={() => setTab("rounds")}>
              Rounds
            </button>
            <button type="button" className={tabClass(tab === "inventory")} onClick={() => setTab("inventory")}>
              Inventory
            </button>
          </div>

          {tab === "treatments" ? (
            <>
              {overdueRounds.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <span className="font-semibold">{overdueRounds.length} overdue round(s).</span>{" "}
                  <button type="button" className="font-medium text-amber-900 underline" onClick={() => setTab("rounds")}>
                    Open Rounds tab
                  </button>
                </div>
              ) : (
                <p className="text-sm text-emerald-800">No overdue rounds.</p>
              )}

              <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={flockId} onChange={(e) => setFlockId(e.target.value)}>
                {flocks.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.reasonCode} onChange={(e) => setForm((v) => ({ ...v, reasonCode: e.target.value }))}>
                {TREATMENT_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Condition details (optional)" value={form.diseaseOrReason} onChange={(e) => setForm((v) => ({ ...v, diseaseOrReason: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Medicine name" value={form.medicineName} onChange={(e) => setForm((v) => ({ ...v, medicineName: e.target.value }))} />
              <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Dose" inputMode="decimal" value={form.dose} onChange={(e) => setForm((v) => ({ ...v, dose: e.target.value }))} />
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.doseUnit} onChange={(e) => setForm((v) => ({ ...v, doseUnit: e.target.value }))}>
                {DOSE_UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <select className="rounded-lg border border-neutral-300 px-3 py-2" value={form.route} onChange={(e) => setForm((v) => ({ ...v, route: e.target.value }))}>
                {ROUTE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
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
                      <p className="font-medium">{r.medicineName} - {treatmentReasonLabel(r)}</p>
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

          {tab === "rounds" ? (
            <>
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-neutral-800">Overdue rounds</p>
                <div className="space-y-2">
                  {overdueRounds.slice(0, 8).map((r) => (
                    <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      {r.medicineName} overdue by {Math.max(1, Math.floor(r.overdueMinutes / 60))}h ({r.flockId})
                    </div>
                  ))}
                  {!overdueRounds.length ? <p className="text-sm text-emerald-700">No overdue rounds.</p> : null}
                </div>
              </div>

              <form onSubmit={submitRound} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-neutral-800">Schedule medicine / vaccine rounds</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <select className="rounded-lg border border-neutral-300 px-3 py-2" value={flockId} onChange={(e) => setFlockId(e.target.value)}>
                    {flocks.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                  <select className="rounded-lg border border-neutral-300 px-3 py-2" value={roundForm.medicineId} onChange={(e) => setRoundForm((v) => ({ ...v, medicineId: e.target.value }))}>
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input className="rounded-lg border border-neutral-300 px-3 py-2" type="datetime-local" value={roundForm.plannedFor} onChange={(e) => setRoundForm((v) => ({ ...v, plannedFor: e.target.value }))} />
                  <select className="rounded-lg border border-neutral-300 px-3 py-2" value={roundForm.route} onChange={(e) => setRoundForm((v) => ({ ...v, route: e.target.value }))}>
                    <option value="drinking_water">drinking water</option>
                    <option value="feed_additive">feed additive</option>
                    <option value="injection">injection</option>
                    <option value="topical">topical</option>
                  </select>
                  <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Planned qty" inputMode="decimal" value={roundForm.plannedQuantity} onChange={(e) => setRoundForm((v) => ({ ...v, plannedQuantity: e.target.value }))} />
                  <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Assign to user id (optional)" value={roundForm.assignedToUserId} onChange={(e) => setRoundForm((v) => ({ ...v, assignedToUserId: e.target.value }))} />
                </div>
                <div className="mt-3 flex justify-end">
                  <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit">
                    Schedule round
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {rounds.slice(0, 12).map((r) => (
                    <div key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                      <p className="font-medium">{r.medicineName} · {new Date(r.plannedFor).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}</p>
                      <p className="text-neutral-600">Status: {r.status} · Qty {r.plannedQuantity}</p>
                      <div className="mt-2 flex gap-2">
                        {r.status !== "completed" ? <button type="button" className="rounded border border-neutral-300 px-2 py-1 text-xs" onClick={() => void updateRoundStatus(r.id, "completed")}>Mark completed</button> : null}
                        {r.status !== "missed" ? <button type="button" className="rounded border border-neutral-300 px-2 py-1 text-xs" onClick={() => void updateRoundStatus(r.id, "missed")}>Mark missed</button> : null}
                      </div>
                    </div>
                  ))}
                  {!rounds.length ? <p className="text-sm text-neutral-500">No rounds scheduled yet.</p> : null}
                </div>
              </form>
            </>
          ) : null}

          {tab === "inventory" ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-neutral-800">Stock forecast (30 days)</p>
              <div className="mb-6 grid gap-2 sm:grid-cols-2">
                {forecastRows.slice(0, 6).map((f) => (
                  <div key={f.id} className="rounded-lg border border-neutral-200 p-2 text-xs">
                    <p className="font-medium text-neutral-900">{f.name}</p>
                    <p className="text-neutral-700">
                      Cover: {f.daysOfCover != null ? `${f.daysOfCover} days` : "insufficient usage data"} · Avg/day {Number(f.avgDailyUse).toFixed(2)} {f.unit}
                    </p>
                    {f.stockoutRisk7d ? <p className="font-semibold text-red-700">Risk: stockout within 7 days</p> : null}
                  </div>
                ))}
                {!forecastRows.length ? <p className="text-sm text-neutral-500">No forecast data yet.</p> : null}
              </div>

              <p className="mb-3 text-sm font-semibold text-neutral-800">On-hand inventory</p>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {medicines.map((m) => {
                  const low = Number(m.quantity) < Number(m.lowStockThreshold ?? 10);
                  return (
                    <div key={m.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-neutral-600">{m.category} · withdrawal {m.withdrawalDays} day(s)</p>
                      <p className={low ? "font-semibold text-red-700" : "font-semibold text-neutral-800"}>
                        Stock: {m.quantity} {m.unit}{low ? " (LOW)" : ""}
                      </p>
                    </div>
                  );
                })}
                {!medicines.length ? <p className="text-sm text-neutral-500">No medicines in stock yet.</p> : null}
              </div>

              <p className="mb-2 text-sm font-semibold text-neutral-800">Add catalog item</p>
              <form onSubmit={submitMedicine} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <input className="rounded-lg border border-neutral-300 px-3 py-2 lg:col-span-2" placeholder="Medicine name" value={medForm.name} onChange={(e) => setMedForm((v) => ({ ...v, name: e.target.value }))} />
                <select className="rounded-lg border border-neutral-300 px-3 py-2" value={medForm.category} onChange={(e) => setMedForm((v) => ({ ...v, category: e.target.value }))}>
                  <option value="vaccine">vaccine</option>
                  <option value="antibiotic">antibiotic</option>
                  <option value="coccidiostat">coccidiostat</option>
                  <option value="vitamin">vitamin</option>
                  <option value="electrolyte">electrolyte</option>
                  <option value="other">other</option>
                </select>
                <select className="rounded-lg border border-neutral-300 px-3 py-2" value={medForm.unit} onChange={(e) => setMedForm((v) => ({ ...v, unit: e.target.value }))} title="Stock unit (database-enforced)">
                  {MED_STOCK_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Opening qty" inputMode="decimal" value={medForm.quantity} onChange={(e) => setMedForm((v) => ({ ...v, quantity: e.target.value }))} />
                <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit">
                  Add item
                </button>
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Withdrawal days" inputMode="numeric" value={medForm.withdrawalDays} onChange={(e) => setMedForm((v) => ({ ...v, withdrawalDays: e.target.value }))} />
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Low-stock alert at" inputMode="numeric" value={medForm.lowStockThreshold} onChange={(e) => setMedForm((v) => ({ ...v, lowStockThreshold: e.target.value }))} />
              </form>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
