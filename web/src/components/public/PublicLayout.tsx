import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { isShopArea } from "../../lib/marketSections";
import { useShopOpen } from "../../lib/useShopOpen";
import { BrandLogo } from "../BrandLogo";
import { type LaborerLocale, writePreLoginLocale } from "../../i18n/laborerI18n";
import { isMarketHostname } from "../../lib/marketHost";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { StoreSwitchBar } from "./StoreSwitchBar";
import { StoreAccountMenu } from "./StoreAccountMenu";
import { StoreLocaleSelect } from "./StoreLocaleSelect";
import { StoreSiteFooter } from "./StoreSiteFooter";
import { StoreWhatsAppFab } from "./StoreWhatsAppFab";

function readInitialLocale(): StoreLocale {
  try {
    const v = localStorage.getItem("laborer_ui_locale") ?? sessionStorage.getItem("laborer_ui_locale");
    return v === "rw" ? "rw" : "en";
  } catch {
    return "en";
  }
}

export type PublicOutletCtx = {
  locale: StoreLocale;
};

export function PublicLayout() {
  const [locale, setLocale] = useState<StoreLocale>(readInitialLocale);
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const { pathname } = useLocation();
  const shopOpen = useShopOpen();
  const grill = isShopArea(pathname, Boolean(shopOpen));

  const pickLocale = (l: StoreLocale) => {
    setLocale(l);
    writePreLoginLocale(l as LaborerLocale);
  };

  return (
    <div className={grill ? "public-store public-store--guest locale-fade store-grill" : "public-store public-store--guest locale-fade"}>
      <header className="store-header">
        <div className="store-wrap">
          <div className="store-header-row">
            <Link to={isMarketHostname(window.location.hostname) ? "/" : "/market"} className="store-brand" aria-label={t("storeBrand")}>
              <BrandLogo size={26} />
              <span>{t("storeBrand")}</span>
            </Link>

            <div className="store-header-tools">
              <StoreLocaleSelect locale={locale} onChange={pickLocale} />
              <Link to="/signup?from=market" className="store-join">
                {t("join")}
              </Link>
              <StoreAccountMenu locale={locale} signupTo="/signup?from=market" />
            </div>
          </div>
        </div>
      </header>

      <StoreSwitchBar locale={locale} />

      <main>
        <Outlet context={{ locale } satisfies PublicOutletCtx} />
      </main>

      <StoreSiteFooter locale={locale} />
      <StoreWhatsAppFab locale={locale} />
    </div>
  );
}
