import { useState } from "react";
import type { BusinessUnitAccess, UserRole } from "../../auth/types";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";

export type AddUserPayload = {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  businessUnitAccess: BusinessUnitAccess;
  canViewSensitiveFinancial: boolean;
  departmentKeys: string[];
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "laborer", label: "Laborer" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "procurement_officer", label: "Procurement officer" },
  { value: "sales_coordinator", label: "Sales coordinator" },
  { value: "vet", label: "Veterinarian" },
  { value: "vet_manager", label: "Vet manager" },
  { value: "investor", label: "Investor (read-oriented)" },
  { value: "manager", label: "Manager" },
  { value: "superuser", label: "Superuser" },
];

const DEPARTMENT_OPTIONS = [
  { key: "investor_memo", label: "Investor memo channel" },
  { key: "credit_committee", label: "Credit committee" },
  { key: "dispatch", label: "Dispatch / logistics" },
];

type Props = {
  onCreated?: () => void;
};

/**
 * Superuser-only: invite/add identity with RBAC, business unit scope,
 * and explicit ClevaCredit sensitive-financial toggle.
 */
export function AddUserForm({ onCreated }: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("laborer");
  const [businessUnitAccess, setBusinessUnitAccess] = useState<BusinessUnitAccess>("farm");
  const [canViewSensitiveFinancial, setCanViewSensitiveFinancial] = useState(false);
  const [departmentKeys, setDepartmentKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDept(key: string) {
    setDepartmentKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload: AddUserPayload = {
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
        role,
        businessUnitAccess,
        canViewSensitiveFinancial,
        departmentKeys,
      };
      // ENV: moved to environment variable
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Failed (${res.status})`);
      }
      const emailOk = (data as { user: { email: string } }).user.email;
      showToast("success", `User created: ${emailOk}`);
      setEmail("");
      setDisplayName("");
      setPassword("");
      setRole("laborer");
      setBusinessUnitAccess("farm");
      setCanViewSensitiveFinancial(false);
      setDepartmentKeys([]);
      onCreated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create user";
      setError(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-neutral-900">Add user</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Assign role and business units. Sensitive financial access is separate from agriculture
        access so farm managers do not automatically see ClevaCredit investor data.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="add-email">
            Work email
          </label>
          <input
            id="add-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="add-name">
            Display name
          </label>
          <input
            id="add-name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-sm font-medium text-neutral-700"
            htmlFor="add-password"
          >
            Initial password
          </label>
          <input
            id="add-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="add-role">
            Role
          </label>
          <select
            id="add-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="add-bu">
            Business unit access
          </label>
          <select
            id="add-bu"
            value={businessUnitAccess}
            onChange={(e) => setBusinessUnitAccess(e.target.value as BusinessUnitAccess)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
          >
            <option value="farm">Farm / Poultry only</option>
            <option value="clevacredit">ClevaCredit only</option>
            <option value="both">Both (workspace switcher)</option>
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded border-neutral-300 text-emerald-800 focus:ring-emerald-700"
            checked={canViewSensitiveFinancial}
            onChange={(e) => setCanViewSensitiveFinancial(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-neutral-900">
              Can view sensitive financial data
            </span>
            <span className="text-sm text-neutral-600">
              Enables net profit, bank balances, and confidential ClevaCredit investor fields. Use
              sparingly — e.g. a farm manager with both units but no investor clearance should leave
              this off.
            </span>
          </span>
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-neutral-700">Department visibility</legend>
        <p className="text-xs text-neutral-500">Restrict navigation slices (demo keys).</p>
        <div className="mt-3 flex flex-col gap-2">
          {DEPARTMENT_OPTIONS.map((d) => (
            <label key={d.key} className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-emerald-800"
                checked={departmentKeys.includes(d.key)}
                onChange={() => toggleDept(d.key)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full min-h-[48px] rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {busy ? "Saving…" : "Create user"}
      </button>
    </form>
  );
}
