import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button } from "../../components/ui/Button";
import { TextLink } from "../../components/ui/TextLink";
import { StatusPill } from "../../components/ui/StatusPill";
import { NoticeStrip } from "../../components/ui/NoticeStrip";
import { PageTabs, Select } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { isSuperuser } from "../../auth/permissions";
import { useERPNextConnection } from "../../context/ERPNextConnectionContext";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useToast } from "../../components/Toast";
import {
  bootstrapChart,
  getAccounts,
  getChartReadiness,
  getCompanies,
  getCostCenters,
  getErpnextConfig,
  getERPNextHealth,
  getWarehouses,
  getWebhookStatus,
  saveErpnextConfig,
  saveWarehouseMapping,
  type ChartReadiness,
  type ChartReadinessItem,
} from "../../api/erpnext.api";
import {
  apiConfigToLocal,
  configToApiPayload,
  type ErpnextAccountMappings,
} from "../../lib/erpnextPrefs";
import { redirectToERPNextLogin } from "../../auth/ERPNextOAuth";
import { ERPNextSyncPanel } from "../../components/accounting/ERPNextSyncPanel";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";

type Company = { name: string; company_name?: string };
type Account = { name: string; account_name?: string };
type CostCenter = { name: string; cost_center_name?: string };
type Warehouse = { name: string; warehouse_name?: string };
type WebhookRow = { doctype: string; event: string; url: string; active: boolean; name?: string | null };
type BarnMapping = { barnName: string; erpnextWarehouse: string };
type HealthInfo = {
  ok?: boolean;
  responseMs?: number;
  failedLast24h?: number;
  pendingCount?: number;
  lastSuccessAt?: string | null;
  authMode?: string;
};

type ErpTab = "overview" | "activity" | "setup";

const BARN_NAMES = ["Barn A", "Barn B", "Barn C", "Main House"];
const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

const ACCOUNT_PICKS = [
  ["feedExpense", "Feed purchase"],
  ["medicineExpense", "Medicine / vet"],
  ["mortalityLoss", "Mortality loss"],
  ["livestockAsset", "Livestock asset"],
  ["revenue", "Flock sales"],
  ["payrollExpense", "Payroll"],
] as const;

function ReadinessRows({ items }: { items: ChartReadinessItem[] }) {
  if (!items.length) return null;
  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.field}
          className="flex items-center gap-3 border-b border-[var(--border-color)] px-3 py-2.5 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {item.number ? `${item.number} · ` : ""}
              {item.label}
            </p>
            {item.value ? (
              <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">{item.value}</p>
            ) : null}
          </div>
          <StatusPill tone={item.ok ? "success" : "warning"}>{item.ok ? "Ready" : "Missing"}</StatusPill>
        </li>
      ))}
    </ul>
  );
}

export function ERPNextSetupPage() {
  const { token, user } = useAuth();
  const canEditErpnextCompany = isSuperuser(user);
  const { companyHref } = useCompanyNav();
  const { status, loading, error, refetch } = useERPNextConnection();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: ErpTab = (() => {
    const t = searchParams.get("tab");
    if (t === "activity" || t === "setup" || t === "overview") return t;
    if (searchParams.get("advanced") === "1") return "setup";
    return "overview";
  })();

  function setTab(next: ErpTab) {
    const params = new URLSearchParams(searchParams);
    params.delete("advanced");
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedCostCenter, setSelectedCostCenter] = useState("");
  const [accountMappings, setAccountMappings] = useState<ErpnextAccountMappings>({});
  const [barnMappings, setBarnMappings] = useState<BarnMapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [readiness, setReadiness] = useState<ChartReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getErpnextConfig(token);
      const local = apiConfigToLocal(data.config ?? null);
      setSelectedCompany(local.company || status?.company || "");
      setSelectedCostCenter(local.costCenter);
      setAccountMappings(local.accountMappings);
      if (Array.isArray(data.warehouseMappings)) {
        setBarnMappings(
          data.warehouseMappings.map((m: { barnName: string; erpnextWarehouse: string }) => ({
            barnName: m.barnName,
            erpnextWarehouse: m.erpnextWarehouse,
          }))
        );
      }
    } catch {
      /* fall back */
    }
  }, [token, status?.company]);

  const loadMeta = useCallback(async () => {
    if (!token || !selectedCompany) return;
    try {
      const [accts, centers, whs, whStatus] = await Promise.all([
        getAccounts(token, selectedCompany),
        getCostCenters(token, selectedCompany),
        getWarehouses(token, selectedCompany),
        getWebhookStatus(token).catch(() => ({ webhooks: [] })),
      ]);
      setAccounts(Array.isArray(accts) ? accts : []);
      setCostCenters(Array.isArray(centers) ? centers : []);
      setWarehouses(Array.isArray(whs) ? whs : []);
      setWebhooks(Array.isArray(whStatus?.webhooks) ? whStatus.webhooks : []);
    } catch {
      setAccounts([]);
      setCostCenters([]);
      setWarehouses([]);
    }
  }, [token, selectedCompany]);

  const loadHealth = useCallback(async () => {
    if (!token) return;
    try {
      setHealth(await getERPNextHealth(token));
    } catch {
      setHealth(null);
    }
  }, [token]);

  const loadReadiness = useCallback(async () => {
    if (!token || !selectedCompany || !status?.connected) {
      setReadiness(null);
      return;
    }
    setReadinessLoading(true);
    try {
      const data = await getChartReadiness(token, selectedCompany);
      setReadiness(data?.error && !data.farm_company ? data : data);
    } catch (e) {
      setReadiness({
        ready: false,
        company: selectedCompany,
        missing: ["error"],
        error: e instanceof Error ? e.message : "Could not load chart readiness",
      });
    } finally {
      setReadinessLoading(false);
    }
  }, [token, selectedCompany, status?.connected]);

  useEffect(() => {
    if (!token) return;
    void getCompanies(token).then((data) => setCompanies(Array.isArray(data) ? data : []));
    void loadConfig();
    void loadHealth();
  }, [token, loadConfig, loadHealth]);

  useEffect(() => {
    if (status?.company && !selectedCompany) setSelectedCompany(status.company);
  }, [status?.company, selectedCompany]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  async function persistConfig(
    nextCompany = selectedCompany,
    nextCc = selectedCostCenter,
    nextMaps = accountMappings
  ) {
    if (!token) return;
    setSaving(true);
    try {
      await saveErpnextConfig(token, configToApiPayload(nextCompany, nextCc, nextMaps));
      showToast("success", "ERPNext configuration saved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function saveCompany(company: string) {
    setSelectedCompany(company);
    void persistConfig(company, selectedCostCenter, accountMappings);
  }

  function saveCostCenter(cc: string) {
    setSelectedCostCenter(cc);
    void persistConfig(selectedCompany, cc, accountMappings);
  }

  function updateMapping(key: keyof ErpnextAccountMappings, value: string) {
    const next = { ...accountMappings, [key]: value || undefined };
    setAccountMappings(next);
    void persistConfig(selectedCompany, selectedCostCenter, next);
  }

  async function updateBarnMapping(barnName: string, erpnextWarehouse: string) {
    if (!token || !erpnextWarehouse) return;
    setBarnMappings((prev) => {
      const rest = prev.filter((m) => m.barnName !== barnName);
      return [...rest, { barnName, erpnextWarehouse }];
    });
    try {
      await saveWarehouseMapping(token, barnName, erpnextWarehouse);
      showToast("success", `Warehouse mapped for ${barnName}.`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Mapping save failed");
    }
  }

  async function runBootstrap() {
    if (!token || !selectedCompany) return;
    setBootstrapping(true);
    try {
      const result = await bootstrapChart(token, selectedCompany);
      if (result?.error && !result.farm_company) {
        showToast("error", result.error);
      } else {
        const created = Object.keys(result?.updated || {}).length;
        showToast(
          "success",
          created > 0 ? `Created or linked ${created} farm chart item(s).` : "Farm chart already ready."
        );
      }
      setReadiness(result);
      void refetch();
      void loadHealth();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Bootstrap failed");
    } finally {
      setBootstrapping(false);
    }
  }

  const missingCount = readiness?.missing?.length ?? 0;
  const readyCount = useMemo(() => {
    const all = [
      ...(readiness?.accounts || []),
      ...(readiness?.items || []),
      ...(readiness?.warehouses || []),
    ];
    return all.filter((i) => i.ok).length;
  }, [readiness]);

  const connected = Boolean(status?.connected);
  const disconnectReason = error || status?.error || "Not connected";

  const headerActions = (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()}>
        Test connection
      </Button>
      {!connected ? (
        <Button type="button" variant="primary" size="sm" onClick={() => redirectToERPNextLogin()}>
          Sign in
        </Button>
      ) : tab === "overview" && selectedCompany ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={bootstrapping}
          loading={bootstrapping}
          onClick={() => void runBootstrap()}
        >
          {readiness?.ready ? "Refresh accounts" : "Create farm accounts"}
        </Button>
      ) : (
        <TextLink href={companyHref("farm/erpnext")}>Open desk</TextLink>
      )}
    </>
  );

  const healthMeta = connected
    ? [
        health?.pendingCount != null ? `${health.pendingCount} pending` : null,
        health?.failedLast24h != null ? `${health.failedLast24h} failed/24h` : null,
        health?.responseMs != null ? `${health.responseMs} ms` : null,
        health?.lastSuccessAt ? `OK ${formatManagerDateTime(health.lastSuccessAt)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <ManagerPage variant="settings">
      <PageHeader
        title="ERPNext"
        action={headerActions}
        tabs={
          <PageTabs
            aria-label="ERPNext sections"
            value={tab}
            onChange={(v) => setTab(v as ErpTab)}
            options={[
              { value: "overview", label: "Overview" },
              { value: "activity", label: "Activity" },
              { value: "setup", label: "Setup" },
            ]}
          />
        }
      />

      {tab === "overview" ? (
        <div className="space-y-stack">
          {!loading && !connected ? (
            <NoticeStrip tone="danger">{disconnectReason}</NoticeStrip>
          ) : null}

          {connected || loading ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={loading ? "neutral" : "success"}>
                    {loading ? "Checking…" : "Connected"}
                  </StatusPill>
                  {connected && status?.user ? (
                    <p className="truncate text-sm text-[var(--text-primary)]">
                      <span className="font-medium">{status.user}</span>
                      {status.company ? (
                        <span className="text-[var(--text-secondary)]"> · {status.company}</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {healthMeta ? (
                  <p className="mt-1 type-caption text-[var(--text-secondary)]">{healthMeta}</p>
                ) : null}
              </div>
              {connected ? (
                <TextLink href={companyHref("farm/erpnext")}>Open desk</TextLink>
              ) : null}
            </div>
          ) : (
            <p className="type-caption text-[var(--text-secondary)]">
              Sign in to link this farm, then create farm accounts.
            </p>
          )}

          {connected ? (
          <div className="table-block">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Farm accounts</p>
              {selectedCompany && readiness ? (
                <p className="type-caption text-[var(--text-secondary)]">
                  {readiness.ready ? "Chart ready" : `${missingCount} missing`}
                  {readyCount ? ` · ${readyCount} linked` : ""}
                </p>
              ) : null}
            </div>

            {!selectedCompany ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Link a company</p>
                <p className="mt-1 type-caption text-[var(--text-secondary)]">
                  Choose the ERPNext company on the Setup tab.
                </p>
                <Button className="mt-3" variant="secondary" size="sm" onClick={() => setTab("setup")}>
                  Open setup
                </Button>
              </div>
            ) : readinessLoading && !readiness ? (
              <p className="px-3 py-6 text-sm text-[var(--text-secondary)]">Checking farm chart…</p>
            ) : readiness?.error && !readiness.farm_company ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Farm company not linked</p>
                <p className="mt-1 type-caption text-[var(--text-secondary)]">{readiness.error}</p>
              </div>
            ) : (
              <div>
                {(readiness?.accounts?.length || 0) > 0 ? (
                  <div>
                    <p className="type-label border-b border-[var(--border-color)] px-3 py-1.5 text-[var(--text-secondary)]">
                      Accounts
                    </p>
                    <ReadinessRows items={readiness?.accounts || []} />
                  </div>
                ) : null}
                {(readiness?.items?.length || 0) > 0 ? (
                  <div>
                    <p className="type-label border-b border-[var(--border-color)] px-3 py-1.5 text-[var(--text-secondary)]">
                      Items
                    </p>
                    <ReadinessRows items={readiness?.items || []} />
                  </div>
                ) : null}
                {(readiness?.warehouses?.length || 0) > 0 ? (
                  <div>
                    <p className="type-label border-b border-[var(--border-color)] px-3 py-1.5 text-[var(--text-secondary)]">
                      Warehouses
                    </p>
                    <ReadinessRows items={readiness?.warehouses || []} />
                  </div>
                ) : null}
                {!readiness?.accounts?.length &&
                !readiness?.items?.length &&
                !readiness?.warehouses?.length ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">No chart items yet</p>
                    <p className="mt-1 type-caption text-[var(--text-secondary)]">
                      Create farm accounts to link the chart of accounts.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          ) : null}
        </div>
      ) : null}

      {tab === "activity" ? <ERPNextSyncPanel embedded /> : null}

      {tab === "setup" ? (
        !connected ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Sign in to configure</p>
            <p className="mt-1 type-caption text-[var(--text-secondary)]">
              Company, cost center, and account mappings load after ERPNext is connected.
            </p>
            <Button
              className="mt-4"
              variant="primary"
              size="sm"
              onClick={() => redirectToERPNextLogin()}
            >
              Sign in
            </Button>
          </div>
        ) : (
          <div className="w-full max-w-md space-y-section">
            {saving ? <p className="type-caption text-[var(--text-secondary)]">Saving…</p> : null}

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  Company
                </span>
                {canEditErpnextCompany ? (
                  <Select
                    className={mgrInput}
                    value={selectedCompany}
                    onChange={(e) => saveCompany(e.target.value)}
                  >
                    <option value="">Select company…</option>
                    {companies.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.company_name || c.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <>
                    <p className="text-sm text-[var(--text-primary)]">
                      {selectedCompany || "Not linked yet"}
                    </p>
                    <p className="mt-1 type-caption text-[var(--text-secondary)]">
                      Linked by the platform administrator.
                    </p>
                  </>
                )}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  Cost center
                </span>
                <Select
                  className={mgrInput}
                  value={selectedCostCenter}
                  onChange={(e) => saveCostCenter(e.target.value)}
                  disabled={!selectedCompany}
                >
                  <option value="">Select cost center…</option>
                  {costCenters.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.cost_center_name || c.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {selectedCompany && accounts.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Account mappings</h3>
                {ACCOUNT_PICKS.map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-1.5 block text-sm text-[var(--text-secondary)]">{label}</span>
                    <Select
                      className={mgrInput}
                      value={accountMappings[key] || ""}
                      onChange={(e) => updateMapping(key, e.target.value)}
                    >
                      <option value="">Default account</option>
                      {accounts.map((a) => (
                        <option key={a.name} value={a.name}>
                          {a.account_name || a.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            ) : null}

            {selectedCompany && warehouses.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Barn warehouses</h3>
                {BARN_NAMES.map((barn) => {
                  const current = barnMappings.find((m) => m.barnName === barn)?.erpnextWarehouse || "";
                  return (
                    <label key={barn} className="block">
                      <span className="mb-1.5 block text-sm text-[var(--text-secondary)]">{barn}</span>
                      <Select
                        className={mgrInput}
                        value={current}
                        onChange={(e) => void updateBarnMapping(barn, e.target.value)}
                      >
                        <option value="">Select warehouse…</option>
                        {warehouses.map((w) => (
                          <option key={w.name} value={w.name}>
                            {w.warehouse_name || w.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  );
                })}
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Webhooks</h3>
              {webhooks.length === 0 ? (
                <p className="type-caption text-[var(--text-secondary)]">None registered yet</p>
              ) : (
                <ul className="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)]">
                  {webhooks.map((w) => (
                    <li
                      key={`${w.doctype}-${w.event}-${w.url}`}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--text-primary)]">
                          {w.doctype}
                          <span className="text-[var(--text-secondary)]"> · {w.event}</span>
                        </p>
                        <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                          {w.url}
                        </p>
                      </div>
                      <StatusPill tone={w.active ? "success" : "neutral"}>
                        {w.active ? "Active" : "Off"}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      ) : null}
    </ManagerPage>
  );
}
