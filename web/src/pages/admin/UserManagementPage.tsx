import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { SessionUser } from "../../auth/types";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { AddUserForm } from "./AddUserForm";
import { API_BASE_URL } from "../../api/config";

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

export function UserManagementPage() {
  const { token } = useAuth();
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

      <AddUserForm onCreated={() => void loadUsers()} />

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
            <ul className="mt-4 space-y-3 sm:hidden">
              {users.map((u) => (
                <li key={u.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                  <p className="font-semibold text-neutral-900">{u.displayName}</p>
                  <p className="text-neutral-600">{u.email}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    {u.role} · {u.businessUnitAccess} · sensitive: {u.canViewSensitiveFinancial ? "Yes" : "No"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {u.departmentKeys.length ? u.departmentKeys.join(", ") : "—"}
                  </p>
                </li>
              ))}
            </ul>
            <div className="institutional-table-wrapper mt-4 hidden overflow-x-auto sm:block">
              <table className="institutional-table text-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Units</th>
                    <th>Sensitive $</th>
                    <th>Departments</th>
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
            <ul className="mt-4 space-y-3 sm:hidden">
              {audit.map((row) => (
                <li key={row.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <p className="font-mono text-xs text-neutral-600">{row.at}</p>
                  <p className="mt-1 font-medium text-neutral-900">
                    {row.action} <span className="text-neutral-500">({row.role})</span>
                  </p>
                  <p className="mt-1 font-mono text-xs text-neutral-700">{row.actor_id}</p>
                  <p className="mt-1 break-all text-xs text-neutral-600">
                    {row.resource}
                    {row.resource_id ? ` / ${row.resource_id}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <div className="institutional-table-wrapper mt-4 hidden overflow-x-auto sm:block">
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
