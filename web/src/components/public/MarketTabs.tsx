import { Link, useLocation } from "react-router-dom";
import { LIVE_PATH, RAW_PATH, sectionForPath } from "../../lib/marketSections";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { useShopOpen } from "../../lib/useShopOpen";
import { shopT } from "../../pages/shop/shopCopy";

/** Fresh chicken | Live birds. Shown only once the shop is open, so traders see no change before. */
export function MarketTabs({ locale }: { locale: StoreLocale }) {
  const { pathname } = useLocation();
  const shopOpen = useShopOpen();
  if (!shopOpen) return null;
  const active = sectionForPath(pathname, true);
  if (!active) return null;
  const tabs = [
    { id: "raw", to: RAW_PATH, label: shopT(locale, "tabRaw"), sub: shopT(locale, "tabRawSub") },
    { id: "live", to: LIVE_PATH, label: shopT(locale, "tabLive"), sub: shopT(locale, "tabLiveSub") },
  ] as const;
  return (
    <nav className="store-sections" aria-label={shopT(locale, "tabsLabel")}>
      <div className="store-wrap">
        <div className="store-sections-row">
          {tabs.map((t) => (
            <Link
              key={t.id}
              to={t.to}
              className="store-section-tab"
              aria-current={active === t.id ? "page" : undefined}
            >
              <span className="store-section-label">{t.label}</span>
              <span className="store-section-sub">{t.sub}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
