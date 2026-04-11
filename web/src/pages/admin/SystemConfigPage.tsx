import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { ErrorState } from "../../components/LoadingSkeleton";

type RefRow = {
  category: string;
  value: string;
  label: string;
  sortOrder: number;
  active: boolean;
  metadata?: Record<string, unknown>;
};

type ConfigResponse = {
  version: number;
  referenceOptionsFlat: RefRow[];
  appSettings: Record<string, string>;
  breedStandards: unknown;
};

const CATEGORY_ORDER = [
  "breed",
  "slaughter_reason",
  "treatment_reason",
  "treatment_route",
  "treatment_dose_unit",
  "medicine_stock_unit",
  "medicine_category",
  "feed_type",
  "medicine_admin_route",
  "inventory_procurement_reason",
  "inventory_consumption_reason",
  "inventory_adjust_reason",
  "department_key",
  "log_schedule_role",
  "role_label",
];

const SETTING_FIELDS: Array<{ key: string; label: string }> = [
  { key: "rate_limit_login_max", label: "Login attempts per IP (per window)" },
  { key: "rate_limit_login_window_ms", label: "Login rate window (ms)" },
  { key: "rate_limit_translate_max", label: "Translate requests per IP (per window)" },
  { key: "rate_limit_translate_window_ms", label: "Translate window (ms)" },
  { key: "rate_limit_api_max", label: "General API requests per IP (per window)" },
  { key: "rate_limit_api_window_ms", label: "General API window (ms)" },
  { key: "max_image_upload_bytes", label: "Max image upload (bytes)" },
  { key: "demo_initial_count", label: "Demo initial flock count fallback" },
];

export function SystemConfigPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(1);
  const [rows, setRows] = useState<RefRow[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [breedJson, setBreedJson] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/admin/system-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = (await r.json()) as ConfigResponse & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed to load configuration");
      setVersion(d.version);
      setRows(
        (d.referenceOptionsFlat ?? []).map((x) => ({
          category: x.category,
          value: x.value,
          label: x.label,
          sortOrder: x.sortOrder ?? 0,
          active: x.active !== false,
          metadata: x.metadata ?? {},
        })),
      );
      const nextSettings = { ...(d.appSettings ?? {}) };
      delete nextSettings.config_version;
      setSettingsDraft(nextSettings);
      setBreedJson(JSON.stringify(d.breedStandards ?? { breeds: {} }, null, 2));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedCategories = useMemo(() => {
    const canManageAll = user?.role === "superuser";
    const keys = [...new Set(rows.map((r) => r.category))].filter((k) =>
      canManageAll ? true : k === "medicine_category" || k === "feed_type"
    );
    keys.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    return keys;
  }, [rows, user?.role]);

  function updateRowAt(index: number, patch: Partial<RefRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRowAt(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow(category: string) {
    const base = `new_${Date.now().toString(36)}`;
    setRows((prev) => [
      ...prev,
      {
        category,
        value: base,
        label: base,
        sortOrder: (prev.filter((r) => r.category === category).length + 1) * 10,
        active: true,
        metadata: {},
      },
    ]);
  }

  async function save() {
    let breedDoc: unknown;
    try {
      breedDoc = JSON.parse(breedJson);
    } catch {
      showToast("error", "Breed standards JSON is invalid.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/admin/system-config`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version,
          referenceOptions: rows.map((x) => ({
            category: x.category,
            value: x.value.trim(),
            label: x.label.trim(),
            sortOrder: x.sortOrder,
            active: x.active,
            metadata: x.metadata ?? {},
          })),
          appSettings: settingsDraft,
          breedStandards: breedDoc,
        }),
      });
      const d = (await r.json()) as ConfigResponse & { error?: string; currentVersion?: number };
      if (r.status === 409) {
        showToast("error", d.error ?? "Version conflict — reload the page.");
        return;
      }
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setVersion(d.version);
      setRows(
        (d.referenceOptionsFlat ?? []).map((x) => ({
          category: x.category,
          value: x.value,
          label: x.label,
          sortOrder: x.sortOrder ?? 0,
          active: x.active !== false,
          metadata: x.metadata ?? {},
        })),
      );
      const nextSettings = { ...(d.appSettings ?? {}) };
      delete nextSettings.config_version;
      setSettingsDraft(nextSettings);
      setBreedJson(JSON.stringify(d.breedStandards ?? { breeds: {} }, null, 2));
      showToast("success", "System configuration saved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-10">
      <PageHeader
        title="System configuration"
        subtitle="Superuser only — reference lists, operational limits, and breed growth JSON (merged over the file default)."
        action={
          <Link
            to="/admin/users"
            className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Back to users
          </Link>
        }
      />

      {loading ? <p className="text-sm text-neutral-600">Loading…</p> : null}
      {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : null}

      {!loading && !loadError ? (
        <>
          {user?.role === "superuser" ? (
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-neutral-900">Operational settings</h2>
              <p className="text-xs text-neutral-500">Config version {version}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SETTING_FIELDS.map((f) => (
                <label key={f.key} className="block text-sm">
                  <span className="text-xs font-medium text-neutral-600">{f.label}</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm"
                    value={settingsDraft[f.key] ?? ""}
                    onChange={(e) => setSettingsDraft((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </section>
          ) : null}

          {user?.role === "superuser" ? (
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Breed standards (JSON)</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Merged over <code className="rounded bg-neutral-100 px-1">data/breed_standards.json</code>. Each breed
              needs <code className="rounded bg-neutral-100 px-1">curve_kg_avg_weight_by_day</code> with numeric day
              keys.
            </p>
            <textarea
              className="mt-3 h-64 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs"
              value={breedJson}
              onChange={(e) => setBreedJson(e.target.value)}
              spellCheck={false}
            />
          </section>
          ) : null}

          {sortedCategories.map((cat) => (
            <section key={cat} className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-neutral-900 font-mono">{cat}</h2>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  onClick={() => addRow(cat)}
                >
                  Add row
                </button>
              </div>
              <div className="institutional-table-wrapper mt-3 overflow-x-auto">
                <table className="institutional-table min-w-full text-sm">
                  <thead>
                    <tr>
                      <th>Value</th>
                      <th>Label</th>
                      <th>Sort</th>
                      <th>Active</th>
                      <th> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .map((r, i) => ({ r, i }))
                      .filter(({ r }) => r.category === cat)
                      .map(({ r, i }) => (
                        <tr key={`${i}`}>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full min-w-[8rem] rounded border border-neutral-200 px-2 py-1 font-mono text-xs"
                              value={r.value}
                              onChange={(e) => updateRowAt(i, { value: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full min-w-[10rem] rounded border border-neutral-200 px-2 py-1 text-xs"
                              value={r.label}
                              onChange={(e) => updateRowAt(i, { label: e.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              className="w-20 rounded border border-neutral-200 px-2 py-1 text-xs"
                              value={r.sortOrder}
                              onChange={(e) =>
                                updateRowAt(i, { sortOrder: Number(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              checked={r.active}
                              onChange={(e) => updateRowAt(i, { active: e.target.checked })}
                            />
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="text-xs text-red-700 hover:underline"
                              onClick={() => removeRowAt(i)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save all changes"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              onClick={() => void load()}
            >
              Reload
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
