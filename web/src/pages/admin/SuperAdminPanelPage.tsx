import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  Button,
  DataTable,
  NoticeStrip,
  SegmentedControl,
  StatusPill,
  TableToolbar,
  ToolbarSearch,
  type DataColumn,
} from "../../components/ui";
import type { SuperAdminCompany } from "./superAdminTypes";

type Filter = "all" | "trial" | "active" | "enterprise" | "suspended";

export function SuperAdminPanelPage() {
  const { token } = useAuth();
  const { navTo } = useCompanyNav();
  const [rows, setRows] = useState<SuperAdminCompany[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCompanies(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/companies`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = (await res.json()) as { companies?: SuperAdminCompany[]; error?: string };
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "trial" && r.plan !== "trial") return false;
      if (filter === "enterprise" && r.plan !== "enterprise") return false;
      if (filter === "active" && !(r.is_active && r.plan !== "trial")) return false;
      if (filter === "suspended" && r.is_active) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  const companyColumns = useMemo(
    (): DataColumn<SuperAdminCompany>[] => [
      {
        key: "company",
        header: "Company",
        render: (r) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--text-primary)]">{r.name}</p>
            <p className="type-caption text-[var(--text-muted)]">{r.slug}</p>
          </div>
        ),
      },
      {
        key: "plan",
        header: "Plan",
        render: (r) => <span className="capitalize">{r.plan}</span>,
      },
      { key: "users", header: "Users", numeric: true, render: (r) => r.users },
      { key: "flocks", header: "Flocks", numeric: true, render: (r) => r.flocks },
      {
        key: "trial",
        header: "Trial ends",
        render: (r) => (r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"),
      },
      {
        key: "status",
        header: "Status",
        badge: true,
        render: (r) => (
          <StatusPill tone={!r.is_active ? "danger" : r.payment_overdue ? "warning" : "success"}>
            {!r.is_active ? "Suspended" : r.payment_overdue ? "Overdue" : "Active"}
          </StatusPill>
        ),
      },
    ],
    []
  );

  const isFiltered = filter !== "all" || query.trim().length > 0;

  return (
    <ManagerPage>
      <PageHeader title="Companies" />

      {error ? <NoticeStrip tone="danger">{error}</NoticeStrip> : null}

      <div className="table-block">
        <DataTable<SuperAdminCompany>
          flush
          columns={companyColumns}
          rows={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => navTo(`/admin/super/companies/${r.id}`)}
          isFiltered={isFiltered}
          emptyTitle={loading ? "Loading companies…" : "No companies yet"}
          emptyDescription="Tenant companies will appear here once created."
          filteredEmptyTitle="No matching companies"
          filteredEmptyDescription="Try another filter or search."
          toolbar={
            <TableToolbar
              filters={
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
              }
              search={
                <ToolbarSearch
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or slug…"
                />
              }
              meta={`${filtered.length} compan${filtered.length === 1 ? "y" : "ies"}`}
              actions={
                <Button variant="secondary" size="sm" onClick={() => void loadCompanies()}>
                  Refresh
                </Button>
              }
            />
          }
        />
      </div>
    </ManagerPage>
  );
}
