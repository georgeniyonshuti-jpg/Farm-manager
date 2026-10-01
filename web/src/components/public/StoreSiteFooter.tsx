import { Link, useLocation } from "react-router-dom";
import { isSellPath } from "../../lib/marketAudience";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

function envSocialHref(raw: unknown, kind: "instagram" | "facebook"): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const handle = s.replace(/^@/, "").replace(/^\/+/, "");
  if (!handle) return null;
  return kind === "instagram"
    ? `https://www.instagram.com/${handle}`
    : `https://www.facebook.com/${handle}`;
}

export function StoreSiteFooter({ locale }: { locale: StoreLocale }) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const year = new Date().getFullYear();
  const location = useLocation();
  const onMarketHome = location.pathname === "/market";
  const onSell = isSellPath(location.pathname);
  const howHref = onMarketHome || onSell ? "/market#how" : "/market/how-it-works";
  const wa = waMeHref(clevaMarketWhatsapp(), t("waPrefill"));
  const instagram = envSocialHref(import.meta.env.VITE_MARKET_INSTAGRAM, "instagram");
  const facebook = envSocialHref(import.meta.env.VITE_MARKET_FACEBOOK, "facebook");

  return (
    <footer className="store-footer">
      <div className="store-wrap store-footer-inner">
        <div className="store-footer-grid">
          <div className="store-footer-col">
            <p className="store-footer-brand">{t("storeBrand")}</p>
            <p className="store-footer-blurb">{t("footerBlurb")}</p>
          </div>

          <div className="store-footer-col">
            <p className="store-footer-label">{t("footerMarket")}</p>
            <nav className="store-footer-links" aria-label={t("footerMarket")}>
              <Link to="/market">{t("listingsThisWeek")}</Link>
              <Link to={howHref}>{t("how")}</Link>
              <Link to="/market?sell=1">{t("gotBirdsAsk")}</Link>
            </nav>
          </div>

          <div className="store-footer-col">
            <p className="store-footer-label">{t("footerTalk")}</p>
            <nav className="store-footer-links" aria-label={t("footerTalk")}>
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer">
                  {t("waCleva")}
                </a>
              ) : null}
              {instagram ? (
                <a href={instagram} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              ) : null}
              {facebook ? (
                <a href={facebook} target="_blank" rel="noreferrer">
                  Facebook
                </a>
              ) : null}
            </nav>
          </div>
        </div>

        <p className="store-footer-legal">
          © {year} {t("footerContact")}
        </p>
      </div>
    </footer>
  );
}
