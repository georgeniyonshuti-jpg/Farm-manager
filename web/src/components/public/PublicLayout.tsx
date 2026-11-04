import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { BrandLogo } from "../BrandLogo";
import { type LaborerLocale, writePreLoginLocale } from "../../i18n/laborerI18n";
import { isMarketHostname } from "../../lib/marketHost";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
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

  const pickLocale = (l: StoreLocale) => {
    setLocale(l);
    writePreLoginLocale(l as LaborerLocale);
  };

  return (
    <div className="public-store public-store--guest locale-fade">
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

      <main>
        <Outlet context={{ locale } satisfies PublicOutletCtx} />
      </main>

      <StoreSiteFooter locale={locale} />
      <StoreWhatsAppFab locale={locale} />
    </div>
  );
}
