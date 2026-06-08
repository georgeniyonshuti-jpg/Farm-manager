import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/OdooConnectionContext";
import { useToast } from "../../components/Toast";
import {
  getAccounts,
  getCompanies,
  getCostCenters,
  getErpnextConfig,
  getWarehouses,
  getWebhookStatus,
  saveErpnextConfig,
  saveWarehouseMapping,
} from "../../api/erpnext.api";
import {
  apiConfigToLocal,
  configToApiPayload,
  type ErpnextAccountMappings,
} from "../../lib/erpnextPrefs";
import { redirectToERPNextLogin } from "../../auth/ERPNextOAuth";

type Company = { name: string; company_name?: string };
type Account = { name: string; account_name?: string };
type CostCenter = { name: string; cost_center_name?: string };
type Warehouse = { name: string; warehouse_name?: string };
type WebhookRow = { doctype: string; event: string; url: string; active: boolean; name?: string | null };
type BarnMapping = { barnName: string; erpnextWarehouse: string };

const BARN_NAMES = ["Barn A", "Barn B", "Barn C", "Main House"];

export function ERPNextSetupPage() {
  const { token } = useAuth();
  const { status, loading, error, refetch } = useERPNextConnection();
  const { showToast } = useToast();
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
      /* fall back to localStorage cache */
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

  useEffect(() => {
    if (!token) return;
    void getCompanies(token).then((data) => {
      setCompanies(Array.isArray(data) ? data : []);
    });
    void loadConfig();
  }, [token, loadConfig]);

  useEffect(() => {
    if (status?.company && !selectedCompany) {
      setSelectedCompany(status.company);
    }
  }, [status?.company, selectedCompany]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  async function persistConfig(nextCompany = selectedCompany, nextCc = selectedCostCenter, nextMaps = accountMappings) {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="ERPNext integration"
        subtitle="Connect ClevaFarm to ERPNext for accounting, inventory, and lending."
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Connection status</h2>
            {loading && <p className="text-sm text-neutral-500">Checking ERPNext…</p>}
            {!loading && status?.connected && (
              <p className="text-sm text-emerald-700">
                Connected as <strong>{status.user}</strong>
                {status.company ? ` · ${status.company}` : ""}
                {status.authMode ? ` · ${status.authMode}` : ""}
              </p>
            )}
            {!loading && !status?.connected && (
              <p className="text-sm text-red-600">{error || status?.error || "Not connected"}</p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
              status?.connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
            }`}
          >
            {status?.connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {status?.connected && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-neutral-500">Companies</dt>
              <dd className="font-semibold">{status.companies ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Customers</dt>
              <dd className="font-semibold">{status.customers ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Loans</dt>
              <dd className="font-semibold">{status.loans ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Accounts</dt>
              <dd className="font-semibold">{status.accounts ?? "—"}</dd>
            </div>
          </dl>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Test connection
          </button>
          <button
            type="button"
            onClick={() => redirectToERPNextLogin()}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
          >
            Sign in with ERPNext
          </button>
        </div>
      </section>

      {!status?.connected && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <h3 className="font-semibold">Setup instructions</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Log in with your ERPNext credentials (same email/password), or configure a service account API key on
              the server for background sync.
            </li>
            <li>
              ERPNext → My Settings → API Access → Generate Keys (for{" "}
              <code className="rounded bg-white px-1">farmapi@clevacredit.com</code> service account only)
            </li>
            <li>
              Server env: <code>ERPNEXT_WEBHOOK_SECRET</code>, <code>CLEVAFARM_API_SECRET</code>
            </li>
          </ol>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Company &amp; cost center</h2>
        {saving && <p className="text-xs text-neutral-500">Saving…</p>}
        <label className="block text-sm">
          <span className="text-neutral-600">ERPNext company</span>
          <select
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            value={selectedCompany}
            onChange={(e) => saveCompany(e.target.value)}
          >
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.name} value={c.name}>
                {c.company_name || c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Default cost center</span>
          <select
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
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
          </select>
        </label>
      </section>

      {selectedCompany && accounts.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Account mapping</h2>
          {(
            [
              ["feedExpense", "Feed purchase account"],
              ["medicineExpense", "Medicine / vet expense account"],
              ["mortalityLoss", "Mortality loss account"],
              ["livestockAsset", "Livestock asset account"],
              ["revenue", "Flock sales revenue account"],
              ["payrollExpense", "Payroll expense account"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-neutral-600">{label}</span>
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={accountMappings[key] || ""}
                onChange={(e) => updateMapping(key, e.target.value)}
              >
                <option value="">Default ERPNext account</option>
                {accounts.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.account_name || a.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}

      {selectedCompany && warehouses.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Barn → warehouse mapping</h2>
          <p className="text-sm text-neutral-600">Map each barn to an ERPNext warehouse for stock entries.</p>
          {BARN_NAMES.map((barn) => {
            const current = barnMappings.find((m) => m.barnName === barn)?.erpnextWarehouse || "";
            return (
              <label key={barn} className="block text-sm">
                <span className="text-neutral-600">{barn}</span>
                <select
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                  value={current}
                  onChange={(e) => void updateBarnMapping(barn, e.target.value)}
                >
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.warehouse_name || w.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Webhook setup</h2>
        <p className="text-sm text-neutral-600">
          Register these webhooks in ERPNext under Setup → Integrations → Webhook. Use the same secret as{" "}
          <code>ERPNEXT_WEBHOOK_SECRET</code> on the farm API.
        </p>
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">DocType</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={`${w.doctype}-${w.event}`} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{w.doctype}</td>
                  <td className="px-3 py-2">{w.event}</td>
                  <td className="px-3 py-2 font-mono text-xs max-w-xs truncate">{w.url}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        w.active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {w.active ? "Active" : "Not registered"}
                    </span>
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-neutral-500">
                    Connect to ERPNext to check webhook registration status.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export { ERPNextSetupPage as OdooSetupPage };
