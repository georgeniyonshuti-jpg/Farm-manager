import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { isBuyerRole, isMarketOnlySeller, canAccessPipelineDesk } from "../../auth/permissions";
import { BrandLogo } from "../BrandLogo";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useMarketLocale } from "../../context/MarketLocaleContext";
import { UserMenuChip } from "./UserMenuChip";
import { StoreLocaleSelect } from "../public/StoreLocaleSelect";

export function MarketPageHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="store-wrap store-app-head">
      <h1 className="store-app-title">{title}</h1>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Chocolate top bar for signed-in buyers and sellers — logo once, account once. */
export function MarketAppHeader() {
  const { user, logout } = useAuth();
  const { companyHref } = useCompanyNav();
  const { locale, setLocale } = useMarketLocale();

  if (!user) return null;

  const seller = !isBuyerRole(user) && !canAccessPipelineDesk(user);
  const homeTo = isBuyerRole(user)
    ? companyHref("/market")
    : canAccessPipelineDesk(user)
      ? companyHref("/market")
      : companyHref("/market/listings");
  const roleBadge = isBuyerRole(user) ? "Buyer" : canAccessPipelineDesk(user) ? "Desk" : "Seller";
  const detailLines = [
    isMarketOnlySeller(user) ? user.displayName : user.companyName,
    user.email,
    seller && isMarketOnlySeller(user) ? "Clevafarm Market" : seller ? "Farm + market" : null,
  ].filter((line): line is string => Boolean(line && line !== user.displayName));

  return (
    <header className="store-header">
      <div className="store-wrap">
        <div className="store-header-row">
          <Link to={homeTo} className="flex min-w-0 shrink-0 items-center gap-1.5 no-underline" aria-label="Clevafarm">
            <BrandLogo size={26} />
            <span className="font-[var(--font-display)] text-[0.98rem] font-extrabold tracking-tight text-[var(--store-ink)] sm:text-lg">
              Clevafarm
            </span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <StoreLocaleSelect locale={locale} onChange={setLocale} />
            <UserMenuChip
              user={user}
              roleBadge={roleBadge}
              onLogout={logout}
              compactOnMobile
              showRolePill={false}
              showChevron
              includeThemeToggle={false}
              avatarTone="store"
              detailLines={detailLines}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
