import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";

type CompanyUsage = {
  id: string;
  name: string;
  plan: string;
  trial_ends_at: string | null;
  is_active: boolean;
  payment_overdue: boolean;
  users: number;
  flocks: number;
};

type Filter = "all" | "trial" | "active" | "suspended";

export function SuperAdminPanelPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<CompanyUsage[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadCompanies(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = (await res.json()) as { companies?: CompanyUsage[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load companies.");
      setRows(body.companies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, [token]);

  async function extendTrial(companyId: string): Promise<void> {
    setBusyId(companyId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${companyId}/extend-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ days: 14 }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to extend trial.");
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function setSuspended(companyId: string, active: boolean): Promise<void> {
    setBusyId(companyId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${companyId}/suspend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ active }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to update status.");
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function publishAnnouncement(): Promise<void> {
    if (!notice.trim()) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: "Platform announcement", message: notice.trim(), type: "info" }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to publish.");
      setNotice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish announcement.");
    }
  }

  const filtered = rows.filter((r) => {
    if (filter === "trial") return r.plan === "trial";
    if (filter === "active") return r.is_active && r.plan !== "trial";
    if (filter === "suspended") return !r.is_active;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Super admin</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Companies, usage, and platform announcements.</p>
      </div>
      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Announcements</h2>
        <textarea
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
          className="mt-3 min-h-24 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
          placeholder="Message shown to all users on next login…"
        />
        <button
          type="button"
          onClick={() => void publishAnnouncement()}
          className="mt-3 rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white"
        >
          Publish
        </button>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Companies</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {loading ? <p className="mt-3 text-sm text-[var(--text-muted)]">Loading…</p> : null}
        {!loading ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                  <th className="py-2">Company</th>
                  <th className="py-2">Plan</th>
                  <th className="py-2">Users</th>
                  <th className="py-2">Flocks</th>
                  <th className="py-2">Trial ends</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border-color)]/60">
                    <td className="py-2 font-medium text-[var(--text-primary)]">{row.name}</td>
                    <td className="py-2">{row.plan}</td>
                    <td className="py-2">{row.users}</td>
                    <td className="py-2">{row.flocks}</td>
                    <td className="py-2">{row.trial_ends_at ? new Date(row.trial_ends_at).toLocaleDateString() : "—"}</td>
                    <td className="py-2">{row.is_active ? (row.payment_overdue ? "Overdue" : "Active") : "Suspended"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="text-xs underline"
                          onClick={() => void extendTrial(row.id)}
                        >
                          Extend trial
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="text-xs underline"
                          onClick={() => void setSuspended(row.id, !row.is_active)}
                        >
                          {row.is_active ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
