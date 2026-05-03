import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { API_BASE_URL } from "../../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { useToast } from "../../components/Toast";

type FlockOption = { id: string; label: string };
type ReportType = "flock_deep_dive" | "flock_comparison" | "farm_operations";

export function ReportsCenterPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [reportType, setReportType] = useState<ReportType>("flock_deep_dive");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [flocks, setFlocks] = useState<FlockOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<unknown>(null);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const t = sp.get("type");
    if (t === "flock_deep_dive" || t === "flock_comparison" || t === "farm_operations") setReportType(t);
    const preselect = sp.get("flockId");
    if (preselect) setSelectedIds([preselect]);
  }, [location.search]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/flocks?includeArchived=true`, { headers: readAuthHeaders(token) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return;
        const options = Array.isArray((d as { flocks?: Array<{ id: string; label: string }> }).flocks)
          ? (d as { flocks: Array<{ id: string; label: string }> }).flocks.map((f) => ({ id: f.id, label: f.label }))
          : [];
        setFlocks(options);
      } catch {
        setFlocks([]);
      }
    };
    void load();
  }, [token]);

  const endpointBase = useMemo(() => {
    if (reportType === "flock_deep_dive") return "/api/reports/flock/deep-dive";
    if (reportType === "flock_comparison") return "/api/reports/flocks/compare";
    return "/api/reports/farm/operations";
  }, [reportType]);

  async function runPreview() {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { from: from || undefined, to: to || undefined };
      if (reportType === "flock_deep_dive") body.flockId = selectedIds[0];
      if (reportType === "flock_comparison") body.flockIds = selectedIds;
      const r = await fetch(`${API_BASE_URL}${endpointBase}/preview`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Preview failed");
      setPreview((d as { report?: unknown }).report ?? null);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { from: from || undefined, to: to || undefined };
      if (reportType === "flock_deep_dive") body.flockId = selectedIds[0];
      if (reportType === "flock_comparison") body.flockIds = selectedIds;
      const r = await fetch(`${API_BASE_URL}${endpointBase}/pdf`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Download failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportType === "flock_deep_dive" ? "flock-deep-dive.pdf" : reportType === "flock_comparison" ? "flock-comparison.pdf" : "farm-operations.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Report downloaded.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  const canPreview = reportType === "farm_operations"
    ? true
    : reportType === "flock_deep_dive"
      ? selectedIds.length === 1
      : selectedIds.length >= 2;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Reports Center" subtitle="Generate beautiful farm intelligence PDFs with analytics, tables, and insights." />
      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Report type</label>
            <select className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
              <option value="flock_deep_dive">Flock deep dive</option>
              <option value="flock_comparison">Flock comparison (2+)</option>
              <option value="farm_operations">Farm operations overview</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
          </div>
        </div>

        {reportType !== "farm_operations" && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Select flock(s)</label>
            <select
              multiple={reportType === "flock_comparison"}
              value={selectedIds}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                setSelectedIds(reportType === "flock_deep_dive" ? vals.slice(0, 1) : vals);
              }}
              className="min-h-[120px] w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm"
            >
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={loading || !canPreview}
            onClick={() => void runPreview()}
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
          >
            {loading ? "Working..." : "Preview JSON"}
          </button>
          <button
            type="button"
            disabled={loading || !canPreview}
            onClick={() => void downloadPdf()}
            className="rounded-lg bg-[var(--primary-color)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Working..." : "Download PDF"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
        <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Preview output</p>
        <pre className="max-h-[420px] overflow-auto rounded border border-[var(--border-color)] bg-[var(--surface-input)] p-3 text-xs text-[var(--text-secondary)]">
          {preview ? JSON.stringify(preview, null, 2) : "No preview yet."}
        </pre>
      </section>
    </div>
  );
}
