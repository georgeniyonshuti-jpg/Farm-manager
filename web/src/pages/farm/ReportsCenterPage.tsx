import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useAuth } from "../../auth/AuthContext";
import { API_BASE_URL } from "../../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { ERPNextReportsSection } from "../../components/accounting/ERPNextReportsSection";
import { useToast } from "../../components/Toast";
import { FieldSubmissionsSection } from "../../components/farm/reports/FieldSubmissionsSection";
import { Button, Field, Input, PageTabs, Select } from "../../components/ui";

type FlockOption = { id: string; label: string };
type ReportType = "flock_deep_dive" | "flock_comparison" | "farm_operations";
type HubTab = "farm" | "field" | "erpnext";
type SubmissionTab = "checkins" | "vet_logs";

const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

const FARM_REPORTS: Array<{
  value: ReportType;
  label: string;
  detail: string;
}> = [
  {
    value: "flock_deep_dive",
    label: "Flock deep dive",
    detail: "Full history and performance for one flock",
  },
  {
    value: "flock_comparison",
    label: "Flock comparison",
    detail: "Side-by-side metrics for two or more flocks",
  },
  {
    value: "farm_operations",
    label: "Farm operations",
    detail: "Farm-wide ops summary for a date range",
  },
];

function endpointFor(type: ReportType): string {
  if (type === "flock_deep_dive") return "/api/reports/flock/deep-dive";
  if (type === "flock_comparison") return "/api/reports/flocks/compare";
  return "/api/reports/farm/operations";
}

function pdfNameFor(type: ReportType): string {
  if (type === "flock_deep_dive") return "flock-deep-dive.pdf";
  if (type === "flock_comparison") return "flock-comparison.pdf";
  return "farm-operations.pdf";
}

export function ReportsCenterPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const hubTab: HubTab = (() => {
    const t = searchParams.get("hub");
    if (t === "field" || t === "erpnext" || t === "farm") return t;
    const type = searchParams.get("type");
    if (type === "field_submissions") return "field";
    return "farm";
  })();

  function setHubTab(next: HubTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "farm") {
      params.delete("hub");
      if (params.get("type") === "field_submissions") params.delete("type");
    } else {
      params.set("hub", next);
      if (next === "field") params.set("type", "field_submissions");
      else params.delete("type");
    }
    setSearchParams(params, { replace: true });
  }

  const [reportType, setReportType] = useState<ReportType>("flock_deep_dive");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [flocks, setFlocks] = useState<FlockOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<unknown>(null);

  const submissionTab: SubmissionTab = useMemo(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return tab === "vet_logs" ? "vet_logs" : "checkins";
  }, [location.search]);

  const submissionFilters = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return {
      flockId: sp.get("flockId") ?? "",
      status: sp.get("status") ?? "all",
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
    };
  }, [location.search]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/flocks?includeArchived=true`, {
          headers: readAuthHeaders(token),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return;
        const options = Array.isArray((d as { flocks?: Array<{ id: string; label: string }> }).flocks)
          ? (d as { flocks: Array<{ id: string; label: string }> }).flocks.map((f) => ({
              id: f.id,
              label: f.label,
            }))
          : [];
        setFlocks(options);
        setSelectedIds((prev) => {
          if (prev.length) return prev;
          return options[0] ? [options[0].id] : [];
        });
      } catch {
        setFlocks([]);
      }
    };
    void load();
  }, [token]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const t = sp.get("type");
    const preselect = sp.get("flockId");
    if (preselect) setSelectedIds([preselect]);
    if (t === "flock_deep_dive" || t === "flock_comparison" || t === "farm_operations") {
      setReportType(t);
    }
  }, [location.search]);

  function onReportTypeChange(next: ReportType) {
    setReportType(next);
    setPreview(null);
    if (next === "flock_deep_dive" && selectedIds.length > 1) {
      setSelectedIds(selectedIds.slice(0, 1));
    }
  }

  const canRun =
    reportType === "farm_operations"
      ? true
      : reportType === "flock_deep_dive"
        ? selectedIds.length === 1
        : selectedIds.length >= 2;

  async function runPreview() {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { from: from || undefined, to: to || undefined };
      if (reportType === "flock_deep_dive") body.flockId = selectedIds[0];
      if (reportType === "flock_comparison") body.flockIds = selectedIds;
      const r = await fetch(`${API_BASE_URL}${endpointFor(reportType)}/preview`, {
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
      const r = await fetch(`${API_BASE_URL}${endpointFor(reportType)}/pdf`, {
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
      a.download = pdfNameFor(reportType);
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

  function toggleComparisonFlock(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  const activeMeta = FARM_REPORTS.find((r) => r.value === reportType);

  return (
    <ManagerPage variant="settings">
      <PageHeader
        title="Reports"
        tabs={
          <PageTabs
            aria-label="Report sections"
            value={hubTab}
            onChange={(v) => setHubTab(v as HubTab)}
            options={[
              { value: "farm", label: "Farm" },
              { value: "field", label: "Field" },
              { value: "erpnext", label: "ERPNext" },
            ]}
          />
        }
      />

      {hubTab === "farm" ? (
        <div className="w-full max-w-md space-y-section">
          <Field label="Report type" help={activeMeta?.detail}>
            <Select
              className={mgrInput}
              value={reportType}
              onChange={(e) => onReportTypeChange(e.target.value as ReportType)}
            >
              {FARM_REPORTS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-3">
            {reportType === "flock_deep_dive" ? (
              <Field label="Flock">
                <Select
                  className={mgrInput}
                  value={selectedIds[0] ?? ""}
                  onChange={(e) => setSelectedIds(e.target.value ? [e.target.value] : [])}
                >
                  <option value="">Select flock…</option>
                  {flocks.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {reportType === "flock_comparison" ? (
              <Field label="Flocks" help="Pick at least 2">
                <ul className="max-h-44 w-full divide-y divide-[var(--border-color)] overflow-y-auto rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)]">
                  {flocks.map((f) => {
                    const on = selectedIds.includes(f.id);
                    return (
                      <li key={f.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[var(--surface-subtle)]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-[var(--border-input)]"
                            checked={on}
                            onChange={() => toggleComparisonFlock(f.id)}
                          />
                          <span className="truncate text-sm text-[var(--text-primary)]">{f.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="From" className="min-w-0">
                <Input
                  type="date"
                  className={`${mgrInput} block w-full min-w-0`}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field label="To" className="min-w-0">
                <Input
                  type="date"
                  className={`${mgrInput} block w-full min-w-0`}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={loading}
              disabled={loading || !canRun}
              onClick={() => void runPreview()}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              disabled={loading || !canRun}
              onClick={() => void downloadPdf()}
            >
              Download PDF
            </Button>
          </div>

          {preview ? (
            <Field label="Preview">
              <pre className="max-h-64 w-full overflow-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </Field>
          ) : null}
        </div>
      ) : null}

      {hubTab === "field" ? (
        <FieldSubmissionsSection
          flocks={flocks}
          initialTab={submissionTab}
          initialFlockId={submissionFilters.flockId}
          initialStatus={submissionFilters.status}
          initialFrom={submissionFilters.from}
          initialTo={submissionFilters.to}
        />
      ) : null}

      {hubTab === "erpnext" ? <ERPNextReportsSection /> : null}
    </ManagerPage>
  );
}
