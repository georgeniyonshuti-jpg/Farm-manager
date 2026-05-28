import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { SessionUser } from "../../auth/types";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { AddUserForm } from "./AddUserForm";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { PAGE_ACCESS_DEFS } from "../../auth/permissions";

type AuditRow = {
  id: string;
  at: string;
  actor_id: string;
  role: string;
  action: string;
  resource: string;
  resource_id: string | null;
  metadata?: Record<string, unknown>;
};

const AUDIT_ACTION_QUICK_FILTERS: Array<{ label: string; value: string }> = [
  { label: "Report exports", value: "report.export" },
  { label: "Round check-ins", value: "farm.round_checkin.create" },
  { label: "Slaughter records", value: "flock.slaughter.create" },
  { label: "Treatments", value: "flock.treatment.create" },
];

const USER_ROLE_OPTIONS: SessionUser["role"][] = [
  "superuser",
  "manager",
  "vet",
  "vet_manager",
  "laborer",
  "procurement_officer",
  "sales_coordinator",
  "investor",
  "dispatcher",
];

const BU_OPTIONS: SessionUser["businessUnitAccess"][] = ["farm", "clevacredit", "both"];

export function UserManagementPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actionDraft, setActionDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const prevTokenRef = useRef<string | null | undefined>(undefined);
  const prevBootstrapRef = useRef<number | undefined>(undefined);
  const [bootstrapKey, setBootstrapKey] = useState(0);
  const [auditRetryKey, setAuditRetryKey] = useState(0);
  const [editingUserId, setEditingUserId] = useState("");
  const [editForm, setEditForm] = useState({
    email: "",
    displayName: "",
    role: "laborer",
    businessUnitAccess: "farm",
    canViewSensitiveFinancial: false,
    departmentKeys: "",
    password: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingPageAccessUserId, setSavingPageAccessUserId] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);

  const pageSize = 20;

  const loadUsers = useCallback(async () => {
    // ENV: moved to environment variable
    const u = await fetch(`${API_BASE_URL}/api/users`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
      r.json()
    );
    if (!u.users) throw new Error(u.error ?? "Users failed");
    setUsers(u.users as SessionUser[]);
  }, [token]);

  useEffect(() => {
    const needFull =
      prevTokenRef.current !== token || prevBootstrapRef.current !== bootstrapKey;
    prevTokenRef.current = token;
    prevBootstrapRef.current = bootstrapKey;

    let cancelled = false;

    const runAudit = async () => {
      const qs = new URLSearchParams({ page: String(auditPage), pageSize: String(pageSize) });
      if (roleFilter.trim()) qs.set("role", roleFilter.trim());
      if (actionFilter.trim()) qs.set("action", actionFilter.trim());
      // ENV: moved to environment variable
      const a = await fetch(`${API_BASE_URL}/api/audit?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      if (cancelled) return;
      setAudit((a.events as AuditRow[]) ?? []);
      setAuditTotal(Number(a.total) || 0);
    };

    (async () => {
      if (needFull) {
        setLoadError(null);
        setAuditError(null);
        setLoading(true);
        setAuditLoading(false);
        try {
          await loadUsers();
          if (cancelled) return;
          await runAudit();
        } catch (e) {
          if (!cancelled) {
            setLoadError(e instanceof Error ? e.message : "Load failed");
            setUsers([]);
            setAudit([]);
            setAuditTotal(0);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        setAuditLoading(true);
        setAuditError(null);
        try {
          await runAudit();
        } catch (e) {
          if (!cancelled) setAuditError(e instanceof Error ? e.message : "Audit load failed");
        } finally {
          if (!cancelled) setAuditLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    bootstrapKey,
    auditPage,
    roleFilter,
    actionFilter,
    auditRetryKey,
    loadUsers,
  ]);

  const roleOptions = useMemo(() => {
    const s = new Set<string>();
    users.forEach((u) => s.add(u.role));
    audit.forEach((r) => s.add(r.role));
    return [...s].sort();
  }, [audit, users]);

  const totalPages = Math.max(1, Math.ceil(auditTotal / pageSize));
  const auditBusy = (loading && !loadError) || auditLoading;

  useEffect(() => {
    const selected = users.find((u) => u.id === editingUserId);
    if (!selected) return;
    setEditForm({
      email: selected.email,
      displayName: selected.displayName,
      role: selected.role,
      businessUnitAccess: selected.businessUnitAccess,
      canViewSensitiveFinancial: selected.canViewSensitiveFinancial,
      departmentKeys: selected.departmentKeys.join(", "),
      password: "",
    });
  }, [editingUserId, users]);

  async function saveUserEdit() {
    const selected = users.find((u) => u.id === editingUserId);
    if (!selected) {
      showToast("error", "Select a user to edit");
      return;
    }
    setSavingEdit(true);
    try {
      const departmentKeys = editForm.departmentKeys
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const r = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(selected.id)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: editForm.email.trim().toLowerCase(),
          displayName: editForm.displayName.trim(),
          role: editForm.role,
          businessUnitAccess: editForm.businessUnitAccess,
          canViewSensitiveFinancial: editForm.canViewSensitiveFinancial,
          departmentKeys,
          password: editForm.password.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", "User updated");
      setEditForm((prev) => ({ ...prev, password: "" }));
      await loadUsers();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  }

  function beginEditUser(userId: string) {
    setEditingUserId(userId);
  }

  async function togglePageAccess(userId: string, pageKey: string, checked: boolean) {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const allKeys = PAGE_ACCESS_DEFS.map((d) => d.key);
    const set = new Set((target.pageAccess?.length ? target.pageAccess : allKeys).map(String));
    if (checked) set.add(pageKey);
    else set.delete(pageKey);
    const pageAccess = [...set];
    setSavingPageAccessUserId(userId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/page-access`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pageAccess }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Page access update failed");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, pageAccess } : u)));
      const edited = users.find((u) => u.id === userId);
      showToast("success", `Page access updated for ${edited?.displayName ?? "user"}`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Page access update failed");
    } finally {
      setSavingPageAccessUserId(null);
    }
  }

  function applyActionFilter(value: string) {
    setActionDraft(value);
    setActionFilter(value.trim());
    setAuditPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <PageHeader
        title="User management"
        subtitle="Superuser only — invites, roles, and audit trail."
        action={
          <Link
            to="/admin/system-config"
            className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            System configuration
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCreateUser((v) => !v)}
          className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
        >
          {showCreateUser ? "Close" : "Create new user"}
        </button>
      </div>

      {showCreateUser ? (
        <AddUserForm
          onCreated={() => {
            setShowCreateUser(false);
            void loadUsers();
          }}
        />
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Page visibility matrix</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Superuser can tick which pages each user can see. Unticked pages are hidden and blocked on direct URL access.
        </p>
        <div className="institutional-table-wrapper mt-4">
          <table className="min-w-[980px] w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="sticky left-0 z-10 bg-[var(--surface-elevated)] px-2 py-2 text-left">User</th>
                {PAGE_ACCESS_DEFS.map((p) => (
                  <th key={p.key} className="px-2 py-2 text-left font-medium text-neutral-600">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const allKeys = PAGE_ACCESS_DEFS.map((d) => d.key);
                const visible = new Set((u.pageAccess?.length ? u.pageAccess : allKeys).map(String));
                return (
                  <tr key={u.id} className="border-b border-neutral-100">
                    <td className="sticky left-0 z-[1] bg-[var(--surface-color)] px-2 py-2">
                      <p className="font-semibold text-neutral-900">{u.displayName}</p>
                      <p className="text-[11px] text-neutral-500">{u.email}</p>
                    </td>
                    {PAGE_ACCESS_DEFS.map((p) => (
                      <td key={`${u.id}_${p.key}`} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={visible.has(p.key)}
                          disabled={savingPageAccessUserId === u.id}
                          onChange={(e) => void togglePageAccess(u.id, p.key, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {editingUserId ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Edit user (including password)</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Password is optional here. Leave blank to keep current password.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={() => setEditingUserId("")}
            >
              Close editor
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              Display name
              <input
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={editForm.displayName}
                onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Email
              <input
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Role
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as SessionUser["role"] }))}
              >
                {USER_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Business unit access
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={editForm.businessUnitAccess}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    businessUnitAccess: e.target.value as SessionUser["businessUnitAccess"],
                  }))
                }
              >
                {BU_OPTIONS.map((bu) => (
                  <option key={bu} value={bu}>
                    {bu}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Department keys (comma-separated)
              <input
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={editForm.departmentKeys}
                onChange={(e) => setEditForm((f) => ({ ...f, departmentKeys: e.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              New password (optional)
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={editForm.canViewSensitiveFinancial}
                onChange={(e) => setEditForm((f) => ({ ...f, canViewSensitiveFinancial: e.target.checked }))}
              />
              Can view sensitive financial data
            </label>
          </div>
          <div className="mt-4">
            <button
              type="button"
              disabled={savingEdit || !editingUserId}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void saveUserEdit()}
            >
              {savingEdit ? "Saving..." : "Save user changes"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Active users</h2>
        {loading ? (
          <div className="mt-4">
            <SkeletonList rows={3} />
          </div>
        ) : null}
        {!loading && loadError ? (
          <div className="mt-4">
            <ErrorState message={loadError} onRetry={() => setBootstrapKey((k) => k + 1)} />
          </div>
        ) : null}
        {!loading && !loadError ? (
          <>
            <div className="institutional-table-wrapper mt-4 overflow-x-auto">
              <table className="institutional-table text-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Units</th>
                    <th>Sensitive $</th>
                    <th>Departments</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.displayName}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td>{u.businessUnitAccess}</td>
                      <td>{u.canViewSensitiveFinancial ? "Yes" : "No"}</td>
                      <td>{u.departmentKeys.length ? u.departmentKeys.join(", ") : "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          onClick={() => beginEditUser(u.id)}
                        >
                          {editingUserId === u.id ? "Editing" : "Edit"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Audit log</h2>
        <p className="mt-1 text-xs text-neutral-500">
          20 events per page. Filter by role (applies immediately) or action substring (apply when ready).
          POST <code className="rounded bg-neutral-100 px-1">/api/audit</code> records actor, role, and resource.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-neutral-500">Quick:</span>
          {AUDIT_ACTION_QUICK_FILTERS.map((q) => (
            <button
              key={q.value}
              type="button"
              disabled={loading || auditBusy}
              className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
                actionFilter === q.value
                  ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
              onClick={() => applyActionFilter(q.value)}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            disabled={loading || auditBusy}
            className="rounded-full border border-dashed border-neutral-400 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            onClick={() => applyActionFilter("")}
          >
            Clear action
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <label htmlFor="audit-role" className="mb-1 block text-xs font-medium text-neutral-600">
              Role
            </label>
            <select
              id="audit-role"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={roleFilter}
              disabled={loading}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setAuditPage(1);
              }}
            >
              <option value="">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[12rem] flex-1 sm:max-w-xs">
            <label htmlFor="audit-action" className="mb-1 block text-xs font-medium text-neutral-600">
              Action contains
            </label>
            <input
              id="audit-action"
              type="text"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              value={actionDraft}
              placeholder="e.g. report.export or farm.mortality"
              disabled={loading}
              onChange={(e) => setActionDraft(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={auditBusy}
            className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
            onClick={() => {
              setActionFilter(actionDraft.trim());
              setAuditPage(1);
            }}
          >
            Apply action filter
          </button>
        </div>

        {auditError ? (
          <div className="mt-4">
            <ErrorState message={auditError} onRetry={() => setAuditRetryKey((k) => k + 1)} />
          </div>
        ) : null}

        {auditBusy ? (
          <div className="mt-4">
            <SkeletonList rows={4} />
          </div>
        ) : null}

        {!auditBusy && !auditError && auditTotal === 0 ? (
          <div className="mt-4">
            <EmptyState title="No audit entries" description="Try another page, role, or action filter." />
          </div>
        ) : null}

        {!auditBusy && !auditError && auditTotal > 0 ? (
          <>
            <div className="institutional-table-wrapper mt-4 overflow-x-auto">
              <table className="institutional-table min-w-[36rem] text-sm">
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-xs">{row.at}</td>
                      <td className="font-mono text-xs">{row.actor_id}</td>
                      <td>{row.role}</td>
                      <td>{row.action}</td>
                      <td className="max-w-[12rem] truncate text-xs">
                        {row.resource}
                        {row.resource_id ? ` / ${row.resource_id}` : ""}
                        {row.metadata && Object.keys(row.metadata).length
                          ? ` ${JSON.stringify(row.metadata)}`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-neutral-600">
            Page {auditPage} of {totalPages} ({auditTotal} rows)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={auditPage <= 1 || auditBusy}
              className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-40"
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={auditPage >= totalPages || auditBusy}
              className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-40"
              onClick={() => setAuditPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
