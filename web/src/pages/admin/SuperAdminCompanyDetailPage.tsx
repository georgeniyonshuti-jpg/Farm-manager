import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useToast } from "../../components/Toast";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  NoticeStrip,
  Select,
  StatusPill,
} from "../../components/ui";
import {
  ASSIGNABLE_PLANS,
  DEFAULT_COMPANY_ID,
  type SuperAdminCompany,
} from "./superAdminTypes";

type ErpnextCompanyOption = { name: string; company_name?: string };

const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

export function SuperAdminCompanyDetailPage() {
  const { companyId = "" } = useParams<{ companyId: string }>();
  const { token } = useAuth();
  const { navTo } = useCompanyNav();
  const { showToast } = useToast();
  const [company, setCompany] = useState<SuperAdminCompany | null>(null);
  const [erpnextCompanies, setErpnextCompanies] = useState<ErpnextCompanyOption[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [planDraft, setPlanDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [exportBeforeDelete, setExportBeforeDelete] = useState(true);

  async function loadCompany(): Promise<void> {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = (await res.json()) as { company?: SuperAdminCompany; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load company.");
      const c = body.company ?? null;
      setCompany(c);
      setLinkDraft(c?.erpnext_company ?? "");
      setPlanDraft(
        c && ASSIGNABLE_PLANS.includes(c.plan as (typeof ASSIGNABLE_PLANS)[number]) ? c.plan : ""
      );
    } catch (err) {
      setCompany(null);
      setError(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompany();
  }, [token, companyId]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/super-admin/erpnext/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setErpnextCompanies([]);
          return;
        }
        const body = (await res.json()) as { companies?: ErpnextCompanyOption[] };
        setErpnextCompanies(body.companies ?? []);
      } catch {
        setErpnextCompanies([]);
      }
    })();
  }, [token]);

  async function saveErpnextLink(): Promise<void> {
    if (!company) return;
    const erpnextCompany = linkDraft.trim();
    if (!erpnextCompany) {
      showToast("error", "Select an ERPNext company before linking.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/erpnext-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ erpnextCompany }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to save ERPNext link.");
      await loadCompany();
      showToast("success", `Linked ${erpnextCompany}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not save ERPNext link.");
    } finally {
      setBusy(false);
    }
  }

  async function extendTrial(): Promise<void> {
    if (!company) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/extend-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ days: 14 }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to extend trial.");
      await loadCompany();
      showToast("success", "Trial extended 14 days.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(): Promise<void> {
    if (!company || !planDraft) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/set-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: planDraft }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to set plan.");
      await loadCompany();
      showToast("success", `Plan set to ${planDraft}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportCompany(): Promise<void> {
    if (!company) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `company-export-${company.slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Export downloaded.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setSuspended(active: boolean): Promise<void> {
    if (!company) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/suspend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ active }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to update status.");
      await loadCompany();
      showToast("success", active ? "Company activated." : "Company suspended.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompany(): Promise<void> {
    if (!company) return;
    setBusy(true);
    try {
      if (exportBeforeDelete) {
        const exportRes = await fetch(`${API_BASE_URL}/api/super-admin/companies/${company.id}/export`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (exportRes.ok) {
          const blob = await exportRes.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `company-export-${company.slug}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
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
      showToast("success", "Company deleted.");
      navTo("/admin/super");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const title = company?.name ?? (loading ? "Company…" : "Company");

  return (
    <ManagerPage variant="settings">
      <PageHeader
        title={title}
        secondaryAction={{ label: "All companies", onClick: () => navTo("/admin/super") }}
      />

      {error ? <NoticeStrip tone="danger">{error}</NoticeStrip> : null}

      {company ? (
        <div className="space-y-section">
          <section className="space-y-stack">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={!company.is_active ? "danger" : company.payment_overdue ? "warning" : "success"}>
                {!company.is_active ? "Suspended" : company.payment_overdue ? "Overdue" : "Active"}
              </StatusPill>
              <span className="type-caption text-[var(--text-muted)]">{company.slug}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {company.users} users · {company.flocks} flocks
            </p>
          </section>

          <section className="space-y-stack rounded-xl border border-[var(--border-color)] p-card">
            <h2 className="type-h3 text-[var(--text-primary)]">Plan & trial</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Plan" className="min-w-[10rem]">
                <Select
                  className={mgrInput}
                  value={planDraft}
                  disabled={busy}
                  onChange={(e) => setPlanDraft(e.target.value)}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {ASSIGNABLE_PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" disabled={busy || !planDraft || planDraft === company.plan} onClick={() => void savePlan()}>
                Save plan
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void extendTrial()}>
                Extend trial 14d
              </Button>
            </div>
            <p className="type-caption text-[var(--text-muted)]">
              Current: <span className="capitalize">{company.plan}</span>
              {company.trial_ends_at
                ? ` · trial ends ${new Date(company.trial_ends_at).toLocaleDateString()}`
                : null}
            </p>
          </section>

          <section className="space-y-stack rounded-xl border border-[var(--border-color)] p-card">
            <h2 className="type-h3 text-[var(--text-primary)]">ERPNext</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Linked company" className="min-w-[14rem] flex-1">
                <Select
                  className={mgrInput}
                  value={linkDraft}
                  disabled={busy || erpnextCompanies.length === 0}
                  onChange={(e) => setLinkDraft(e.target.value)}
                >
                  <option value="">Not linked</option>
                  {erpnextCompanies.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.company_name || c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                size="sm"
                disabled={
                  busy ||
                  !linkDraft.trim() ||
                  linkDraft === (company.erpnext_company ?? "")
                }
                onClick={() => void saveErpnextLink()}
              >
                Save link
              </Button>
            </div>
            {erpnextCompanies.length === 0 ? (
              <p className="type-caption text-[var(--text-muted)]">
                ERPNext company list unavailable (check API credentials).
              </p>
            ) : null}
          </section>

          <section className="space-y-stack rounded-xl border border-[var(--border-color)] border-[var(--status-danger)]/30 p-card">
            <h2 className="type-h3 text-[var(--text-primary)]">Danger zone</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void exportCompany()}>
                Export JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void setSuspended(!company.is_active)}
              >
                {company.is_active ? "Suspend" : "Activate"}
              </Button>
              {company.id !== DEFAULT_COMPANY_ID ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeleteSlugInput("");
                    setExportBeforeDelete(true);
                  }}
                >
                  Delete permanently
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      ) : loading ? (
        <p className="type-caption text-[var(--text-muted)]">Loading…</p>
      ) : null}

      <Modal
        open={deleteOpen && company != null}
        title="Delete company permanently"
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!company || busy || deleteSlugInput.trim() !== company.slug}
              onClick={() => void deleteCompany()}
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        {company ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Removes <strong className="text-[var(--text-primary)]">{company.name}</strong> and all users,
              flocks, inventory, vet logs, billing, and ERPNext config. Cannot be undone.
            </p>
            <Checkbox
              label="Download export before deleting"
              checked={exportBeforeDelete}
              onChange={(e) => setExportBeforeDelete(e.target.checked)}
            />
            <Field label={`Type ${company.slug} to confirm`}>
              <Input
                className={mgrInput}
                value={deleteSlugInput}
                onChange={(e) => setDeleteSlugInput(e.target.value)}
                placeholder={company.slug}
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </ManagerPage>
  );
}
