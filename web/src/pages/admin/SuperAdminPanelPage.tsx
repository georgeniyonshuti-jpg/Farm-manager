import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { DataRepairSection } from "../../components/admin/DataRepairSection";
import { SuperAdminPlansSection } from "./SuperAdminPlansSection";
import { SegmentedControl } from "../../components/ui";

type CompanyUsage = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  is_active: boolean;
  payment_overdue: boolean;
  erpnext_company: string | null;
  users: number;
  flocks: number;
};

const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

type ErpnextCompanyOption = { name: string; company_name?: string };

type Filter = "all" | "trial" | "active" | "enterprise" | "suspended";

const ASSIGNABLE_PLANS = ["starter", "pro", "enterprise"] as const;

export function SuperAdminPanelPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<CompanyUsage[]>([]);
  const [erpnextCompanies, setErpnextCompanies] = useState<ErpnextCompanyOption[]>([]);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyUsage | null>(null);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [exportBeforeDelete, setExportBeforeDelete] = useState(true);

  async function loadCompanies(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = (await res.json()) as { companies?: CompanyUsage[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load companies.");
      const companies = body.companies ?? [];
      setRows(companies);
      setLinkDrafts(
        Object.fromEntries(
          companies.map((c) => [c.id, c.erpnext_company ?? ""])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/super-admin/erpnext/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json()) as { companies?: ErpnextCompanyOption[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load ERPNext companies.");
        setErpnextCompanies(body.companies ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load ERPNext companies.");
      }
    })();
  }, [token]);

  async function saveErpnextLink(companyId: string): Promise<void> {
    const erpnextCompany = linkDrafts[companyId]?.trim();
    if (!erpnextCompany) {
      setError("Select an ERPNext company before linking.");
      return;
    }
    setBusyId(companyId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${companyId}/erpnext-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ erpnextCompany }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to save ERPNext link.");
      setNotice(`ERPNext company linked: ${erpnextCompany}`);
      await loadCompanies();
      const companyName = rows.find((r) => r.id === companyId)?.name ?? "company";
      setSuccessMsg(`ERPNext company "${erpnextCompany}" linked to ${companyName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save ERPNext link.");
    } finally {
      setBusyId(null);
    }
  }

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

  async function setPlan(companyId: string, plan: string): Promise<void> {
    setBusyId(companyId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${companyId}/set-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to set plan.");
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function exportCompany(company: CompanyUsage): Promise<void> {
    setBusyId(company.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `company-export-${company.slug || company.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCompany(company: CompanyUsage): Promise<void> {
    if (deleteSlugInput.trim() !== company.slug) {
      setError("Slug confirmation does not match.");
      return;
    }
    setBusyId(company.id);
    setError(null);
    try {
      if (exportBeforeDelete) {
        await exportCompany(company);
      }
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confirmSlug: deleteSlugInput.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Delete failed.");
      setDeleteTarget(null);
      setDeleteSlugInput("");
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
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
    if (filter === "enterprise") return r.plan === "enterprise";
    if (filter === "active") return r.is_active && r.plan !== "trial";
    if (filter === "suspended") return !r.is_active;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Super admin</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Companies, billing plans, usage, and platform announcements.</p>
      </div>
      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {successMsg ? (
        <p className="rounded-lg border border-[var(--status-success)]/30 bg-[var(--status-success-soft)] px-3 py-2 text-sm text-[var(--status-success)]">
          {successMsg}
        </p>
      ) : null}

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

      <SuperAdminPlansSection token={token} onError={setError} />

      <DataRepairSection />

      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Companies</h2>
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: "all", label: "All" },
              { value: "trial", label: "Trial" },
              { value: "active", label: "Active" },
              { value: "enterprise", label: "Enterprise" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
        </div>
        {loading ? <p className="mt-3 text-sm text-[var(--text-muted)]">Loading…</p> : null}
        {!loading ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                  <th className="py-2">Company</th>
                  <th className="py-2">ERPNext company</th>
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
                    <td className="py-2">
                      <div className="flex min-w-[14rem] flex-wrap items-center gap-2">
                        <select
                          value={linkDrafts[row.id] ?? row.erpnext_company ?? ""}
                          onChange={(e) =>
                            setLinkDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                          disabled={busyId === row.id || erpnextCompanies.length === 0}
                          className="min-w-[10rem] rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-2 py-1 text-xs"
                        >
                          <option value="">Not linked</option>
                          {erpnextCompanies.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.company_name || c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={
                            busyId === row.id ||
                            !(linkDrafts[row.id] ?? row.erpnext_company ?? "").trim() ||
                            (linkDrafts[row.id] ?? row.erpnext_company ?? "") === (row.erpnext_company ?? "")
                          }
                          className="text-xs underline disabled:opacity-40"
                          onClick={() => void saveErpnextLink(row.id)}
                        >
                          Link
                        </button>
                      </div>
                    </td>
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
                          onClick={() => void exportCompany(row)}
                        >
                          Export
                        </button>
                        {row.id !== DEFAULT_COMPANY_ID ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="text-xs text-red-400 underline"
                            onClick={() => {
                              setDeleteTarget(row);
                              setDeleteSlugInput("");
                              setExportBeforeDelete(true);
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="text-xs underline"
                          onClick={() => void extendTrial(row.id)}
                        >
                          Extend trial
                        </button>
                        {row.plan !== "enterprise" ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            className="text-xs font-medium text-emerald-400 underline"
                            onClick={() => void setPlan(row.id, "enterprise")}
                          >
                            Make enterprise
                          </button>
                        ) : null}
                        <label className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <span>Plan</span>
                          <select
                            value={ASSIGNABLE_PLANS.includes(row.plan as (typeof ASSIGNABLE_PLANS)[number]) ? row.plan : ""}
                            disabled={busyId === row.id}
                            className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-1 py-0.5 text-xs"
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next) void setPlan(row.id, next);
                            }}
                          >
                            <option value="" disabled>
                              Set…
                            </option>
                            {ASSIGNABLE_PLANS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </label>
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

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-lg rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-red-400">Delete company permanently</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This will remove <strong>{deleteTarget.name}</strong> and all associated users, flocks, feed
              inventory, vet logs, billing records, and ERPNext config. This cannot be undone.
            </p>
            <ul className="mt-3 list-inside list-disc text-xs text-[var(--text-muted)]">
              <li>{deleteTarget.users} users</li>
              <li>{deleteTarget.flocks} flocks</li>
              <li>All inventory and operational history</li>
            </ul>
            <label className="mt-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={exportBeforeDelete}
                onChange={(e) => setExportBeforeDelete(e.target.checked)}
              />
              Download export before deleting
            </label>
            <div className="mt-4">
              <label className="mb-1 block text-sm text-[var(--text-secondary)]">
                Type <code className="rounded bg-black/20 px-1">{deleteTarget.slug}</code> to confirm
              </label>
              <input
                value={deleteSlugInput}
                onChange={(e) => setDeleteSlugInput(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2 text-sm"
                placeholder={deleteTarget.slug}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === deleteTarget.id || deleteSlugInput.trim() !== deleteTarget.slug}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void deleteCompany(deleteTarget)}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
