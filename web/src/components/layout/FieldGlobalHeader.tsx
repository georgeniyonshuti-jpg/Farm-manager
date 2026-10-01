import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { fieldHomeFirstName, fieldHomeGreetingPrefix, type FieldChromeMode } from "../../lib/fieldChrome";
import { useLaborerT } from "../../i18n/laborerI18n";
import { BrandLogo } from "../BrandLogo";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { FieldAccountCluster } from "./FieldAccountCluster";

type Props = {
  mode: Exclude<FieldChromeMode, "hidden">;
};

export function FieldGlobalHeader({ mode }: Props) {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const appName = useLaborerT("Clevafarm");
  const greetingPrefix = useLaborerT(fieldHomeGreetingPrefix());
  const todayLabel = useLaborerT("Today");
  const greeting = user?.displayName
    ? `${greetingPrefix}, ${fieldHomeFirstName(user.displayName)}`
    : todayLabel;

  if (!user) return null;

  const homeTo =
    user.role === "sales_coordinator"
      ? companyHref("/farm/pipeline")
      : user.role === "vet"
        ? companyHref("/dashboard/vet")
        : companyHref("/dashboard/laborer");

  const headerShell = (children: ReactNode, className = "") => (
    <header
      className={`sticky top-0 z-[100] shrink-0 border-b border-[var(--border-color)] bg-[var(--surface-elevated)] pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur ${className}`}
    >
      {children}
    </header>
  );

  if (mode === "minimal") {
    return headerShell(
      <div className="flex min-h-[40px] items-center justify-end gap-1.5 px-2.5 py-1">
        <FieldAccountCluster compact />
      </div>
    );
  }

  return headerShell(
    <div className="flex min-h-[48px] items-center gap-2 px-2.5 py-1.5">
      <Link to={homeTo} className="flex shrink-0 items-center" aria-label={appName}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-color-soft)]">
          <BrandLogo size={30} />
        </span>
      </Link>
      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text-primary)]">
        {greeting}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <FieldAccountCluster compact />
      </div>
    </div>
  );
}
