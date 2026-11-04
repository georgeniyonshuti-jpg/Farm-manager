import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { StoreCartButton } from "../../components/public/StoreCartButton";
import { StoreLocaleSelect } from "../../components/public/StoreLocaleSelect";
import { StoreWhatsAppFab } from "../../components/public/StoreWhatsAppFab";
import type { PublicOutletCtx } from "../../components/public/PublicLayout";
import { type LaborerLocale, writePreLoginLocale } from "../../i18n/laborerI18n";
import { MARKET_HOST } from "../../lib/marketHost";
import { categoryPath, shopPath } from "../../lib/marketSections";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { BigChixMark } from "./BigChixMark";
import { shopT, type ShopCopyKey } from "./shopCopy";

function readInitialLocale(): StoreLocale {
  try {
    const v = localStorage.getItem("laborer_ui_locale") ?? sessionStorage.getItem("laborer_ui_locale");
    return v === "rw" ? "rw" : "en";
  } catch {
    return "en";
  }
}

/** The food shop: shop.cleva.rw (or /shop locally). Only food here; businesses go to market.cleva.rw. */
export function ShopLayout() {
  const [locale, setLocale] = useState<StoreLocale>(readInitialLocale);
  const t = (k: ShopCopyKey) => shopT(locale, k);
  const pickLocale = (l: StoreLocale) => {
    setLocale(l);
    writePreLoginLocale(l as LaborerLocale);
  };
  const wa = waMeHref(clevaMarketWhatsapp(), t("waHello"));
  const year = new Date().getFullYear();

  return (
    <div className="public-store public-store--guest locale-fade store-grill">
      <header className="store-header">
        <div className="store-wrap">
          <div className="store-header-row">
            <Link to={shopPath()} className="store-brand" aria-label={t("brand")}>
              <BigChixMark size={26} />
            </Link>
            <div className="store-header-tools">
              <StoreLocaleSelect locale={locale} onChange={pickLocale} />
              <StoreCartButton locale={locale} />
            </div>
          </div>
        </div>
      </header>

      <main>
        <Outlet context={{ locale } satisfies PublicOutletCtx} />
      </main>

      <footer className="store-footer">
        <div className="store-wrap store-footer-inner">
          <div className="store-footer-grid">
            <div className="store-footer-col">
              <p className="store-footer-brand">
                <BigChixMark size={30} />
              </p>
              <p className="store-footer-blurb">{t("footerBlurb")}</p>
            </div>
            <div className="store-footer-col">
              <p className="store-footer-label">{t("footerMenu")}</p>
              <nav className="store-footer-links" aria-label={t("footerMenu")}>
                <Link to={shopPath()}>{t("backToMenu")}</Link>
                <Link to={categoryPath("whole")}>{t("freshLink")}</Link>
              </nav>
            </div>
            <div className="store-footer-col">
              <p className="store-footer-label">{t("footerHelp")}</p>
              <nav className="store-footer-links" aria-label={t("footerHelp")}>
                {wa ? (
                  <a href={wa} target="_blank" rel="noreferrer">
                    {t("footerWhatsapp")}
                  </a>
                ) : null}
                <a href={`https://${MARKET_HOST}/`}>{t("footerBusiness")}</a>
              </nav>
            </div>
          </div>
          <p className="store-footer-legal">
            © {year} BigChix by Cleva · Kigali
            {" · "}
            <Link to={shopPath("privacy")}>{t("privacy")}</Link>
          </p>
        </div>
      </footer>

      <StoreWhatsAppFab locale={locale} text={t("waHello")} label={t("footerWhatsapp")} />
    </div>
  );
}
