import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPageByKey } from "../../auth/permissions";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ManagerPage } from "../../components/layout/ManagerPage";
import {
  FacetFilter,
  Field,
  Input,
  Modal,
  PageTabs,
  StatusPill,
  TableToolbar,
  ToolbarSearch,
} from "../../components/ui";

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

type ConfigTab = "lists" | "settings" | "breeds";

type IndexedRow = RefRow & { _i: number };

type EditorState = {
  mode: "add" | "edit";
  index: number | null;
  category: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
  valueLocked: boolean;
};

const CATEGORY_ORDER = [
  "breed",
  "slaughter_reason",
  "feed_type",
  "treatment_reason",
  "treatment_route",
  "treatment_dose_unit",
  "medicine_stock_unit",
  "medicine_category",
  "medicine_admin_route",
  "inventory_procurement_reason",
  "inventory_consumption_reason",
  "inventory_adjust_reason",
  "department_key",
  "log_schedule_role",
  "role_label",
];

const CATEGORY_LABELS: Record<string, string> = {
  breed: "Breeds",
  slaughter_reason: "Slaughter reasons",
  treatment_reason: "Treatment reasons",
  treatment_route: "Treatment routes",
  treatment_dose_unit: "Dose units",
  medicine_stock_unit: "Medicine stock units",
  medicine_category: "Medicine categories",
  feed_type: "Feed types",
  medicine_admin_route: "Medicine admin routes",
  inventory_procurement_reason: "Procurement reasons",
  inventory_consumption_reason: "Consumption reasons",
  inventory_adjust_reason: "Adjustment reasons",
  department_key: "Departments",
  log_schedule_role: "Schedule roles",
  role_label: "Role labels",
};

function humanCategory(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

const SETTING_FIELDS: Array<{ key: string; label: string }> = [
  { key: "rate_limit_login_max", label: "Login attempts per IP (per window)" },
  { key: "rate_limit_login_window_ms", label: "Login rate window (ms)" },
  { key: "rate_limit_translate_max", label: "Translate requests per IP (per window)" },
  { key: "rate_limit_translate_window_ms", label: "Translate window (ms)" },
  { key: "rate_limit_api_max", label: "General API requests per IP (per window)" },
  { key: "rate_limit_api_window_ms", label: "General API window (ms)" },
  { key: "max_image_upload_bytes", label: "Max image upload (bytes)" },
  { key: "demo_initial_count", label: "Demo initial flock count fallback" },
  { key: "reference_market_price_rwf_per_kg", label: "Reference market price (RWF/kg)" },
  { key: "reference_costs_to_sell_rwf_per_kg", label: "Reference costs to sell (RWF/kg)" },
  { key: "pipeline_scout_commission_rate_pct", label: "Scout commission rate (%)" },
  { key: "pipeline_scout_visit_fee_rwf", label: "Scout visit fee (RWF)" },
];

const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

export function SystemConfigPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(1);
  const [rows, setRows] = useState<RefRow[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [breedJson, setBreedJson] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{ index: number; label: string; category: string } | null>(
    null
  );
  const [tab, setTab] = useState<ConfigTab>("lists");
  const [listFilter, setListFilter] = useState<string>("all");
  const [listFilterInitialized, setListFilterInitialized] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);

  const canLoad = canAccessPageByKey(user, "admin_system_config");
  const isSuperuser = user?.role === "superuser";

  const load = useCallback(async () => {
    if (!canLoad) {
      setLoading(false);
      return;
    }
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
        }))
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
  }, [token, canLoad]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedCategories = useMemo(() => {
    if (!canLoad) return [];
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
  }, [rows, user?.role, canLoad]);

  useEffect(() => {
    if (listFilter !== "all" && sortedCategories.length && !sortedCategories.includes(listFilter)) {
      setListFilter(sortedCategories[0] ?? "all");
      return;
    }
    if (!listFilterInitialized && sortedCategories[0]) {
      setListFilter(sortedCategories[0]);
      setListFilterInitialized(true);
    }
  }, [listFilter, sortedCategories, listFilterInitialized]);

  const tabOptions = useMemo(() => {
    const opts: { value: ConfigTab; label: string }[] = [{ value: "lists", label: "Lists" }];
    if (isSuperuser) {
      opts.push({ value: "settings", label: "Settings" });
      opts.push({ value: "breeds", label: "Breed standards" });
    }
    return opts;
  }, [isSuperuser]);

  useEffect(() => {
    if (!tabOptions.some((o) => o.value === tab)) setTab("lists");
  }, [tab, tabOptions]);

  const indexedRows: IndexedRow[] = useMemo(
    () => rows.map((r, _i) => ({ ...r, _i })),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return indexedRows
      .filter((r) => (listFilter === "all" ? true : r.category === listFilter))
      .filter((r) => {
        if (!q) return true;
        return (
          r.label.toLowerCase().includes(q) ||
          r.value.toLowerCase().includes(q) ||
          humanCategory(r.category).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ca = CATEGORY_ORDER.indexOf(a.category);
        const cb = CATEGORY_ORDER.indexOf(b.category);
        const catCmp =
          (ca >= 0 ? ca : 999) - (cb >= 0 ? cb : 999) || a.category.localeCompare(b.category);
        if (catCmp !== 0) return catCmp;
        return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
      });
  }, [indexedRows, listFilter, searchQ]);

  const isFiltered = listFilter !== "all" || searchQ.trim().length > 0;

  if (!canLoad) return null;

  function updateRowAt(index: number, patch: Partial<RefRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRowAt(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function openAdd() {
    const category = listFilter !== "all" ? listFilter : sortedCategories[0] ?? "breed";
    const nextSort = (rows.filter((r) => r.category === category).length + 1) * 10;
    setEditor({
      mode: "add",
      index: null,
      category,
      label: "",
      value: "",
      sortOrder: nextSort,
      active: true,
      valueLocked: false,
    });
  }

  function openEdit(row: IndexedRow) {
    setEditor({
      mode: "edit",
      index: row._i,
      category: row.category,
      label: row.label,
      value: row.value,
      sortOrder: row.sortOrder,
      active: row.active,
      valueLocked: true,
    });
  }

  function commitEditor() {
    if (!editor) return;
    const label = editor.label.trim();
    const value = (editor.value.trim() || slugify(label)).trim();
    if (!label || !value) {
      showToast("error", "Label and value are required.");
      return;
    }
    if (!editor.category) {
      showToast("error", "Choose a list.");
      return;
    }
    if (editor.mode === "add") {
      setRows((prev) => [
        ...prev,
        {
          category: editor.category,
          value,
          label,
          sortOrder: editor.sortOrder,
          active: editor.active,
          metadata: {},
        },
      ]);
    } else if (editor.index != null) {
      updateRowAt(editor.index, {
        category: editor.category,
        label,
        value,
        sortOrder: editor.sortOrder,
        active: editor.active,
      });
    }
    setEditor(null);
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
        }))
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
    <ManagerPage variant="settings">
      <PageHeader
        title="Lists & types"
        secondaryAction={{ label: "Users", onClick: () => navigate("/admin/users") }}
        primaryAction={{
          label: saving ? "Saving…" : "Save changes",
          onClick: () => void save(),
          disabled: saving || loading || Boolean(loadError),
        }}
        tabs={
          tabOptions.length > 1 ? (
            <PageTabs
              aria-label="Configuration sections"
              value={tab}
              onChange={(v) => setTab(v as ConfigTab)}
              options={tabOptions}
            />
          ) : undefined
        }
      />

      {loading ? <SkeletonList rows={4} /> : null}
      {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : null}

      {!loading && !loadError && tab === "lists" ? (
        <div className="table-block">
          <div className="table-toolbar">
            <TableToolbar
              filters={
                <FacetFilter
                  label="List"
                  value={listFilter}
                  allValue="all"
                  allLabel="All lists"
                  onChange={setListFilter}
                  options={sortedCategories.map((c) => ({
                    value: c,
                    label: humanCategory(c),
                  }))}
                />
              }
              search={
                <ToolbarSearch
                  placeholder="Search labels or keys…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  label="Search list items"
                />
              }
              meta={`v${version} · ${visibleRows.length} items`}
              actions={
                <Button variant="secondary" size="sm" onClick={openAdd}>
                  Add item
                </Button>
              }
            />
          </div>

          {visibleRows.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {isFiltered ? "No matching items" : "No list items yet"}
              </p>
              {!isFiltered ? (
                <Button className="mt-3" variant="secondary" size="sm" onClick={openAdd}>
                  Add item
                </Button>
              ) : null}
            </div>
          ) : (
            <div>
              <div
                className={`grid items-center gap-3 border-b border-[var(--border-color)] px-3 py-2 ${
                  listFilter === "all"
                    ? "grid-cols-[9.5rem_minmax(0,1fr)_auto]"
                    : "grid-cols-[minmax(0,1fr)_auto]"
                }`}
              >
                {listFilter === "all" ? (
                  <p className="type-label text-[var(--text-secondary)]">Group</p>
                ) : null}
                <p className="type-label text-[var(--text-secondary)]">Item</p>
                <p className="type-label text-right text-[var(--text-secondary)]">Actions</p>
              </div>
              <ul>
                {visibleRows.map((r) => (
                  <li
                    key={`${r.category}:${r._i}:${r.value}`}
                    className={`grid items-center gap-3 border-b border-[var(--border-color)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-subtle)] ${
                      listFilter === "all"
                        ? "grid-cols-[9.5rem_minmax(0,1fr)_auto]"
                        : "grid-cols-[minmax(0,1fr)_auto]"
                    }`}
                  >
                    {listFilter === "all" ? (
                      <p className="truncate text-sm text-[var(--text-secondary)]">
                        {humanCategory(r.category)}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => openEdit(r)}
                    >
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{r.label}</p>
                      {r.value.trim() !== r.label.trim() ? (
                        <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                          {r.value}
                        </p>
                      ) : null}
                    </button>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => updateRowAt(r._i, { active: !r.active })}
                        aria-label={r.active ? "Mark inactive" : "Mark active"}
                      >
                        <StatusPill tone={r.active ? "success" : "neutral"}>
                          {r.active ? "Active" : "Off"}
                        </StatusPill>
                      </button>
                      <Button variant="ghost" size="xs" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[var(--status-danger)] hover:bg-[var(--status-danger-soft)] hover:text-[var(--status-danger)]"
                        onClick={() =>
                          setConfirmTarget({
                            index: r._i,
                            label: r.label,
                            category: r.category,
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {!loading && !loadError && tab === "settings" && isSuperuser ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Operational settings</h2>
            <span className="type-caption tabular-nums text-[var(--text-primary)]">v{version}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SETTING_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  className={`${mgrInput} font-mono`}
                  value={settingsDraft[f.key] ?? ""}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && !loadError && tab === "breeds" && isSuperuser ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Breed standards</h2>
          <textarea
            className="h-80 w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
            value={breedJson}
            onChange={(e) => setBreedJson(e.target.value)}
            spellCheck={false}
            aria-label="Breed standards JSON"
          />
        </div>
      ) : null}

      <Modal
        open={editor != null}
        title={editor?.mode === "add" ? "Add item" : "Edit item"}
        onClose={() => setEditor(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={commitEditor}>
              {editor?.mode === "add" ? "Add" : "Update"}
            </Button>
          </div>
        }
      >
        {editor ? (
          <div className="space-y-3">
            <Field label="List">
              <select
                className={`${mgrInput} w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2`}
                value={editor.category}
                onChange={(e) =>
                  setEditor((prev) => (prev ? { ...prev, category: e.target.value } : prev))
                }
              >
                {sortedCategories.map((c) => (
                  <option key={c} value={c}>
                    {humanCategory(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Label">
              <Input
                className={mgrInput}
                value={editor.label}
                autoFocus
                onChange={(e) => {
                  const label = e.target.value;
                  setEditor((prev) => {
                    if (!prev) return prev;
                    if (!prev.valueLocked) {
                      return { ...prev, label, value: slugify(label) };
                    }
                    return { ...prev, label };
                  });
                }}
              />
            </Field>
            <Field label="Key">
              <Input
                className={`${mgrInput} font-mono`}
                value={editor.value}
                onChange={(e) =>
                  setEditor((prev) =>
                    prev ? { ...prev, value: e.target.value, valueLocked: true } : prev
                  )
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort">
                <Input
                  type="number"
                  className={mgrInput}
                  value={editor.sortOrder}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev ? { ...prev, sortOrder: Number(e.target.value) || 0 } : prev
                    )
                  }
                />
              </Field>
              <Field label="Status">
                <button
                  type="button"
                  className="mt-1"
                  onClick={() =>
                    setEditor((prev) => (prev ? { ...prev, active: !prev.active } : prev))
                  }
                >
                  <StatusPill tone={editor.active ? "success" : "neutral"}>
                    {editor.active ? "Active" : "Off"}
                  </StatusPill>
                </button>
              </Field>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Remove item"
        message={
          confirmTarget
            ? `Remove “${confirmTarget.label}” from ${humanCategory(confirmTarget.category)}?`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (confirmTarget) removeRowAt(confirmTarget.index);
          setConfirmTarget(null);
        }}
        onCancel={() => setConfirmTarget(null)}
      />
    </ManagerPage>
  );
}
