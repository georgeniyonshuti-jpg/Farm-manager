import { useCallback, useEffect, useState } from "react";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

type BroilerInputs = Record<string, number>;

export function BusinessModelBroilerOpsTab(props: {
  token: string | null;
  broilerInputs: BroilerInputs | null;
  cycleId: string;
  onCycleIdChange: (id: string) => void;
}) {
  const { token, broilerInputs, cycleId, onCycleIdChange } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compliance, setCompliance] = useState<{ score: number; expected: number; done: number; vetStatus?: string } | null>(
    null
  );
  const [checkins, setCheckins] = useState<Record<string, unknown>[]>([]);
  const [vetRows, setVetRows] = useState<Record<string, unknown>[]>([]);
  const [mortRows, setMortRows] = useState<Record<string, unknown>[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);

  const [feedOk, setFeedOk] = useState(true);
  const [waterOk, setWaterOk] = useState(true);
  const [photoOk, setPhotoOk] = useState(false);
  const [notes, setNotes] = useState("");
  const [birdsLost, setBirdsLost] = useState(0);
  const [vetSummary, setVetSummary] = useState("");
  const [vetStatus, setVetStatus] = useState("Moderate");
  const [snapLabel, setSnapLabel] = useState("");

  const refresh = useCallback(async () => {
    if (!token) return;
    setError(null);
    const qs = new URLSearchParams({
      cycleId,
      cycleDays: String(Math.floor(Number(broilerInputs?.cycle_days ?? 35))),
    }).toString();
    try {
      const [rc, rv, rm, rs] = await Promise.all([
        fetch(`${API_BASE_URL}/api/business-model/broiler-ops/checkins?${qs}`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/business-model/broiler-ops/vet-reports?${qs}`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/business-model/broiler-ops/mortality?${qs}`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/business-model/broiler-ops/snapshots`, { headers: readAuthHeaders(token) }),
      ]);
      const dc = await rc.json();
      if (!rc.ok) throw new Error((dc as { error?: string }).error ?? "checkins");
      setCheckins((dc as { rows: Record<string, unknown>[] }).rows ?? []);
      const dv = await rv.json();
      setVetRows(rv.ok ? ((dv as { rows: Record<string, unknown>[] }).rows ?? []) : []);
      const dm = await rm.json();
      setMortRows(rm.ok ? ((dm as { rows: Record<string, unknown>[] }).rows ?? []) : []);
      const ds = await rs.json();
      setSnapshots((ds as { rows: Record<string, unknown>[] }).rows ?? []);

      const rco = await fetch(`${API_BASE_URL}/api/business-model/broiler-ops/compliance?${qs}`, {
        headers: readAuthHeaders(token),
      });
      const dco = await rco.json();
      if (rco.ok) {
        setCompliance({
          score: Number(dco.score),
          expected: Number(dco.expected),
          done: Number(dco.done),
          vetStatus: String(dco.vetStatus ?? ""),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    }
  }, [token, cycleId, broilerInputs?.cycle_days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const postJson = async (url: string, body: object) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Request failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadBroilerPdf = async () => {
    if (!token || !broilerInputs) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/broiler-pdf`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          inputs: broilerInputs,
          cycleId,
          farmName: `Cycle ${cycleId}`,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "PDF failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "broiler-cycle-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-neutral-700">
          Cycle ID
          <input
            className="mt-1 block rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            value={cycleId}
            onChange={(e) => onCycleIdChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void postJson(`${API_BASE_URL}/api/business-model/broiler-ops/seed-demo`, { cycleId })}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium"
        >
          Seed demo logs
        </button>
        <button
          type="button"
          disabled={busy || !broilerInputs}
          onClick={() => void downloadBroilerPdf()}
          className="rounded-lg bg-violet-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Download broiler PDF
        </button>
      </div>

      {compliance ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm">
            <p className="text-xs font-medium text-emerald-900">Compliance (7d)</p>
            <p className="text-2xl font-bold text-emerald-950">{Math.round(compliance.score)}</p>
            <p className="text-xs text-emerald-800">
              {compliance.done}/{compliance.expected} days with check-in
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm">
            <p className="text-xs font-medium text-amber-900">Latest vet status</p>
            <p className="text-lg font-semibold text-amber-950">{compliance.vetStatus ?? "—"}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold">Daily check-in</h3>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={feedOk} onChange={(e) => setFeedOk(e.target.checked)} />
            Feed OK
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={waterOk} onChange={(e) => setWaterOk(e.target.checked)} />
            Water OK
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={photoOk} onChange={(e) => setPhotoOk(e.target.checked)} />
            Photo OK
          </label>
        </div>
        <input
          className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void postJson(`${API_BASE_URL}/api/business-model/broiler-ops/checkin`, {
              cycleId,
              feedOk,
              waterOk,
              photoOk,
              notes,
            })
          }
          className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save check-in
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold">Mortality event</h3>
        <input
          type="number"
          className="w-32 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          value={birdsLost}
          min={0}
          onChange={(e) => setBirdsLost(Number(e.target.value))}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void postJson(`${API_BASE_URL}/api/business-model/broiler-ops/mortality`, { cycleId, birdsLost, notes: "" })}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Log mortality
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold">Vet report</h3>
        <textarea
          className="w-full min-h-[72px] rounded-lg border border-neutral-300 p-2 text-sm"
          value={vetSummary}
          onChange={(e) => setVetSummary(e.target.value)}
          placeholder="Summary"
        />
        <select
          className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          value={vetStatus}
          onChange={(e) => setVetStatus(e.target.value)}
        >
          <option value="Good">Good</option>
          <option value="Moderate">Moderate</option>
          <option value="Risk">Risk</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void postJson(`${API_BASE_URL}/api/business-model/broiler-ops/vet-report`, {
              cycleId,
              summary: vetSummary,
              status: vetStatus,
            })
          }
          className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save vet report
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold">Snapshot inputs</h3>
        <input
          className="w-full max-w-md rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          value={snapLabel}
          onChange={(e) => setSnapLabel(e.target.value)}
          placeholder="Label"
        />
        <button
          type="button"
          disabled={busy || !broilerInputs}
          onClick={() =>
            void postJson(`${API_BASE_URL}/api/business-model/broiler-ops/snapshot`, {
              label: snapLabel || "Snapshot",
              inputs: broilerInputs,
            })
          }
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          Save snapshot
        </button>
        <ul className="max-h-32 overflow-auto text-xs text-neutral-600">
          {snapshots.map((s) => (
            <li key={String(s.id)}>
              {(s.saved_at as string) ?? ""} — {String(s.label ?? "")}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border p-3 text-xs">
          <h4 className="font-semibold text-sm mb-2">Check-ins</h4>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {checkins.map((c, i) => (
              <li key={i}>
                {String(c.check_date)} — F{String(c.feed_ok)}/W{String(c.water_ok)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-3 text-xs">
          <h4 className="font-semibold text-sm mb-2">Vet</h4>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {vetRows.map((c, i) => (
              <li key={i}>
                {String(c.report_date)} — {String(c.status)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-3 text-xs">
          <h4 className="font-semibold text-sm mb-2">Mortality</h4>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {mortRows.map((c, i) => (
              <li key={i}>
                {String(c.event_date)} — {String(c.birds_lost)} birds
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
