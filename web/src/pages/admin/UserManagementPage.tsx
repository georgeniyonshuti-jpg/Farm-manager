import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { SessionUser } from "../../auth/types";
import { isSuperuser, canManageUsers } from "../../auth/permissions";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { AddUserForm } from "./AddUserForm";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import {
  DataTable,
  FacetFilter,
  StatusPill,
  TableToolbar,
  ToolbarSearch,
  type DataColumn,
} from "../../components/ui";
import { PAGE_ACCESS_DEFS } from "../../auth/permissions";
import { ManagerPage } from "../../components/layout/ManagerPage";

const ROLE_CAPABILITY_BLURBS: Record<string, string[]> = {
  laborer: ["Round check-in", "Feed log", "Mortality log"],
  dispatcher: ["Round check-in", "Feed log", "Mortality log"],
  vet: ["Vet logs", "Medicine", "Treatments"],
  vet_manager: ["Review vet logs", "Medicine", "Flocks", "Today"],
  manager: ["Operations, inventory, slaughter, reviews"],
  company_admin: ["Users, lists & types, all farm records"],
  superuser: ["All companies and system configuration"],
  procurement_officer: ["Feed inventory"],
  sales_coordinator: ["Market ops: verify, desk, commissions"],
  buyer: ["Browse market and book lots"],
  investor: ["Portfolio views"],
};

function humanAuditAction(action: string): string {
  const map: Record<string, string> = {
    "report.export": "Exported a report",
    "farm.round_checkin.create": "Submitted a round check-in",
    "flock.slaughter.create": "Recorded slaughter",
  };
  if (map[action]) return map[action];
  return action.replace(/\./g, " · ").replace(/_/g, " ");
}

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
  "company_admin",
  "manager",
  "vet",
  "vet_manager",
  "laborer",
  "procurement_officer",
  "sales_coordinator",
  "buyer",
  "investor",
  "dispatcher",
];

const BU_OPTIONS: SessionUser["businessUnitAccess"][] = ["farm", "clevacredit", "both"];

const ROLE_LABELS: Record<string, string> = {
  superuser: "Superuser",
  company_admin: "Company Admin",
  manager: "Manager",
  vet: "Veterinarian",
  vet_manager: "Vet Manager",
  laborer: "Field Worker",
  procurement_officer: "Procurement Officer",
  sales_coordinator: "Sales Coordinator",
  buyer: "Buyer",
  investor: "Investor",
  dispatcher: "Dispatcher",
};
function humanRole(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const BU_LABELS: Record<string, string> = { farm: "Farm", clevacredit: "ClevaCredit", both: "Farm + ClevaCredit" };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function UserManagementPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
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
  const [showAdvancedAccess, setShowAdvancedAccess] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SessionUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());

  const pageSize = 20;

  function toggleAuditExpand(id: string) {
    setExpandedAudit((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  const editableRoleOptions = useMemo(
    () => (isSuperuser(user) ? USER_ROLE_OPTIONS : USER_ROLE_OPTIONS.filter((r) => r !== "superuser")),
    [user],
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.displayName, u.email, u.role, u.businessUnitAccess, humanRole(u.role)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [users, userSearch]);

  const userColumns: DataColumn<SessionUser>[] = useMemo(
    () => [
      { key: "name", header: "Name", render: (u) => u.displayName },
      {
        key: "role",
        header: "Role",
        badge: true,
        render: (u) => <StatusPill tone="info">{humanRole(u.role)}</StatusPill>,
      },
      { key: "unit", header: "Unit", render: (u) => u.businessUnitAccess },
      { key: "email", header: "Email", render: (u) => u.email },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (u) => (
          <div className="flex items-center justify-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => beginEditUser(u.id)}>
              {editingUserId === u.id ? "Editing" : "Edit"}
            </Button>
            {u.id !== user?.id ? (
              <Button variant="dangerGhost" size="sm" onClick={() => setRemoveTarget(u)}>
                Remove
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [editingUserId, user?.id]
  );

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

  async function confirmRemoveUser() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(removeTarget.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Remove failed");
      showToast("success", `${removeTarget.displayName} was removed from this farm.`);
      setRemoveTarget(null);
      if (editingUserId === removeTarget.id) setEditingUserId("");
      await loadUsers();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
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
    <ManagerPage variant="settings">
      <PageHeader
        title={canManageUsers(user) && !isSuperuser(user) ? "Company users" : "Users"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/system-config"
              className="text-sm font-semibold text-[var(--primary-color)] underline-offset-2 hover:underline"
            >
              Lists & types
            </Link>
            <Button variant="primary" size="sm" onClick={() => setShowCreateUser(true)}>
              Create user
            </Button>
          </div>
        }
      />

      <Modal open={showCreateUser} title="Create user" onClose={() => setShowCreateUser(false)} wide>
        <AddUserForm
          onCreated={() => {
            setShowCreateUser(false);
            void loadUsers();
          }}
        />
      </Modal>

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-card shadow-sm">
        {loading ? (
          <SkeletonList rows={3} />
        ) : null}
        {!loading && loadError ? (
          <ErrorState message={loadError} onRetry={() => setBootstrapKey((k) => k + 1)} />
        ) : null}
        {!loading && !loadError ? (
          <DataTable<SessionUser>
              columns={userColumns}
              rows={filteredUsers}
              rowKey={(u) => u.id}
              isFiltered={userSearch.trim().length > 0}
              emptyTitle="No users yet"
              emptyDescription="Create a user to grant farm access."
              filteredEmptyTitle="No matching users"
              filteredEmptyDescription="Try a different name, email, or role."
              toolbar={
                <TableToolbar
                  search={
                    <ToolbarSearch
                      placeholder="Search name, email, role…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      label="Search users"
                    />
                  }
                  meta={`${filteredUsers.length} of ${users.length}`}
                />
              }
              renderMobileCard={(u) => (
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{u.displayName}</span>
                    <StatusPill tone="info">{humanRole(u.role)}</StatusPill>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => beginEditUser(u.id)}>
                      Edit
                    </Button>
                    {u.id !== user?.id ? (
                      <Button variant="dangerGhost" size="sm" onClick={() => setRemoveTarget(u)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            />
        ) : null}
      </section>

      {editingUserId ? (
        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Edit user (including password)</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Password is optional here. Leave blank to keep current password.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditingUserId("")}
            >
              Close editor
            </Button>
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
                {editableRoleOptions.map((r) => (
                  <option key={r} value={r}>
                    {humanRole(r)}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">What this role can do</p>
              <ul className="mt-1 list-inside list-disc">
                {(ROLE_CAPABILITY_BLURBS[editForm.role] ?? ["Standard farm access"]).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
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
                    {BU_LABELS[bu] ?? bu}
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
            <Button variant="primary" disabled={savingEdit || !editingUserId} onClick={() => void saveUserEdit()}>
              {savingEdit ? "Saving..." : "Save user changes"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Advanced page access</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Optional checklist of pages. Prefer changing the role above unless you need a one-off exception.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowAdvancedAccess((v) => !v)}>
            {showAdvancedAccess ? "Hide" : "Show matrix"}
          </Button>
        </div>
        {showAdvancedAccess ? (
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
        ) : null}
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-card shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Activity</h2>

        <div className="mt-3">
          <TableToolbar
            filters={
              <>
                <FacetFilter
                  label="Action"
                  value={actionFilter || "all"}
                  allValue="all"
                  onChange={(v) => applyActionFilter(v === "all" ? "" : v)}
                  options={AUDIT_ACTION_QUICK_FILTERS.map((q) => ({
                    value: q.value,
                    label: q.label,
                  }))}
                />
                <FacetFilter
                  label="Role"
                  value={roleFilter || "all"}
                  allValue="all"
                  onChange={(v) => {
                    setRoleFilter(v === "all" ? "" : v);
                    setAuditPage(1);
                  }}
                  options={roleOptions.map((r) => ({ value: r, label: humanRole(r) }))}
                />
              </>
            }
            search={
              <ToolbarSearch
                placeholder="Action contains…"
                value={actionDraft}
                onChange={(e) => {
                  setActionDraft(e.target.value);
                  setActionFilter(e.target.value.trim());
                  setAuditPage(1);
                }}
                label="Filter activity by action"
                disabled={loading}
              />
            }
            meta={auditBusy ? "Loading…" : `${auditTotal} events`}
          />
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
            <EmptyState title="No audit entries" description="Try another page, role, or action filter." action={<Button variant="secondary" size="sm" onClick={() => { setRoleFilter(""); setAuditPage(1); }}>Clear filters</Button>} />
          </div>
        ) : null}

        {!auditBusy && !auditError && auditTotal > 0 ? (
          <>
            <div className="institutional-table-wrapper mt-4 overflow-x-auto">
              <table className="institutional-table min-w-[36rem] text-sm">
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="sticky left-0 z-10 bg-[var(--surface-elevated)]">Actor</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => {
                    const hasMetadata = row.metadata && Object.keys(row.metadata).length > 0;
                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={hasMetadata ? "cursor-pointer hover:bg-neutral-50" : ""}
                          onClick={() => (hasMetadata ? toggleAuditExpand(row.id) : undefined)}
                        >
                          <td className="font-mono text-xs" title={row.at}>
                            {relativeTime(row.at)}
                          </td>
                          <td className="sticky left-0 z-[1] bg-white font-mono text-xs">{row.actor_id}</td>
                          <td>{humanRole(row.role)}</td>
                          <td>{humanAuditAction(row.action)}</td>
                          <td className="max-w-[12rem] truncate text-xs">
                            {row.resource}
                            {row.resource_id ? ` / ${row.resource_id}` : ""}
                          </td>
                        </tr>
                        {expandedAudit.has(row.id) && hasMetadata ? (
                          <tr>
                            <td colSpan={5} className="bg-neutral-50 px-4 py-3 text-xs">
                              <pre className="whitespace-pre-wrap font-mono text-neutral-600">
                                {JSON.stringify(row.metadata, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
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
            <Button
              variant="secondary"
              size="sm"
              disabled={auditPage <= 1 || auditBusy}
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={auditPage >= totalPages || auditBusy}
              onClick={() => setAuditPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      <Modal
        open={removeTarget != null}
        title="Remove user"
        onClose={() => (removing ? undefined : setRemoveTarget(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmRemoveUser()} disabled={removing}>
              {removing ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      >
        <p className="type-body text-[var(--text-primary)]">
          Remove <strong>{removeTarget?.displayName}</strong> from this farm? They will lose access immediately.
        </p>
        <p className="mt-2 type-caption">
          Their historical records (logs, treatments, check-ins) are preserved for audit, but they can no longer sign in.
        </p>
      </Modal>
    </ManagerPage>
  );
}
