import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { BusinessUnitAccess, UserRole } from "../../auth/types";
import { isSuperuser } from "../../auth/permissions";
import { useApiFetch } from "../../api/fetchClient";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/ui/Button";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";

export type AddUserPayload = {
  email: string;
  displayName: string;
  /** Sent for the live API, which still requires a password. A newer API ignores this and issues its own. */
  password: string;
  role: UserRole;
  businessUnitAccess: BusinessUnitAccess;
  canViewSensitiveFinancial: boolean;
  departmentKeys: string[];
};

function makeTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "laborer", label: "Laborer" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "procurement_officer", label: "Procurement officer" },
  { value: "sales_coordinator", label: "Sales coordinator" },
  { value: "sales_officer", label: "Sales officer" },
  { value: "buyer", label: "Buyer (market)" },
  { value: "butcher", label: "Butcher (shop partner)" },
  { value: "vet", label: "Veterinarian" },
  { value: "vet_manager", label: "Vet manager" },
  { value: "investor", label: "Investor (read-oriented)" },
  { value: "manager", label: "Manager" },
  { value: "company_admin", label: "Company admin" },
  { value: "superuser", label: "Superuser" },
];

const DEPARTMENT_OPTIONS = [
  { key: "investor_memo", label: "Investor memo channel" },
  { key: "credit_committee", label: "Credit committee" },
  { key: "dispatch", label: "Dispatch / logistics" },
];

function insertRoleOption(
  options: { value: string; label: string }[],
  option: { value: string; label: string }
) {
  const after = options.findIndex((item) => item.value === "sales_coordinator");
  if (after < 0) return [...options, option];
  return [...options.slice(0, after + 1), option, ...options.slice(after + 1)];
}

type Props = {
  onCreated?: () => void;
};

/**
 * Superuser-only: invite/add identity with RBAC, business unit scope,
 * and explicit Clevafarm finance sensitive-data toggle.
 */
export function AddUserForm({ onCreated }: Props) {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const loadedRoleLabels = useReferenceOptions(
    "role_label",
    token,
    ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ).filter((o) => isSuperuser(user) || o.value !== "superuser");
  const withOfficer = loadedRoleLabels.some((o) => o.value === "sales_officer")
    ? loadedRoleLabels
    : insertRoleOption(loadedRoleLabels, { value: "sales_officer", label: "Sales officer" });
  const roleLabelOptions = withOfficer.some((o) => o.value === "butcher")
    ? withOfficer
    : [...withOfficer, { value: "butcher", label: "Butcher (shop partner)" }];
  const departmentRefOptions = useReferenceOptions(
    "department_key",
    token,
    DEPARTMENT_OPTIONS.map((d) => ({ value: d.key, label: d.label })),
  );
  const apiFetch = useApiFetch();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("laborer");
  const [businessUnitAccess, setBusinessUnitAccess] = useState<BusinessUnitAccess>("farm");
  const [canViewSensitiveFinancial, setCanViewSensitiveFinancial] = useState(false);
  const [departmentKeys, setDepartmentKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handedPassword, setHandedPassword] = useState<string | null>(null);

  function toggleDept(key: string) {
    setDepartmentKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (handedPassword) {
      onCreated?.();
      return;
    }
    setError(null);
    setHandedPassword(null);
    setBusy(true);
    const generatedPassword = makeTemporaryPassword();
    try {
      const payload: AddUserPayload = {
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        password: generatedPassword,
        role,
        businessUnitAccess,
        canViewSensitiveFinancial,
        departmentKeys,
      };
      const data = await apiFetch<{ user: { email: string }; emailSent?: boolean; temporaryPassword?: string }>(
        "/api/users",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
        "Create user failed"
      );
      const emailOk = data.user.email;
      setEmail("");
      setDisplayName("");
      setRole("laborer");
      setBusinessUnitAccess("farm");
      setCanViewSensitiveFinancial(false);
      setDepartmentKeys([]);
      if (data.emailSent) {
        showToast("success", `User created: ${emailOk}. A temporary password was emailed.`);
        onCreated?.();
      } else {
        const handed = data.temporaryPassword || generatedPassword;
        setHandedPassword(handed);
        showToast("success", `User created: ${emailOk}. Copy the temporary password before you close this.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create user";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-card shadow-sm"
    >
      <h2 className="text-lg font-semibold text-neutral-900">Add user</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Assign role and business units. Sensitive financial access is separate from agriculture
        access so farm managers do not automatically see Clevafarm finance investor data.
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
        {handedPassword ? (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Temporary password (shown once)</p>
            <p className="mt-1 font-mono">{handedPassword}</p>
            <p className="mt-1">Pass this to them. They must choose a new password after signing in.</p>
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="add-role">
            Role
          </label>
          <select
            id="add-role"
            value={role}
            onChange={(e) => {
              const next = e.target.value as UserRole;
              setRole(next);
              if (next === "sales_officer" || next === "sales_coordinator" || next === "buyer") {
                setBusinessUnitAccess("market");
              }
            }}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
          >
            {roleLabelOptions.map((o) => (
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
            <option value="farm">Farm operations</option>
            <option value="market">Market</option>
            <option value="clevacredit">Finance</option>
            <option value="both">Farm and Finance</option>
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
              Enables net profit, bank balances, and confidential Clevafarm finance investor fields. Use
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
          {departmentRefOptions.map((d) => (
            <label key={d.value} className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-emerald-800"
                checked={departmentKeys.includes(d.value)}
                onChange={() => toggleDept(d.value)}
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

      {handedPassword ? (
        <Button type="button" size="lg" className="mt-6 w-full sm:w-auto" onClick={() => onCreated?.()}>
          Done
        </Button>
      ) : (
        <Button type="submit" size="lg" disabled={busy} loading={busy} className="mt-6 w-full sm:w-auto">
          {busy ? "Saving…" : "Create user"}
        </Button>
      )}
    </form>
  );
}
