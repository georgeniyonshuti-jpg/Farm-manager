import { Link } from "react-router-dom";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { WHOLESALE_PATH } from "../../lib/marketSections";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import { shopT, type ShopCopyKey } from "./shopCopy";

const FEATURES: { title: ShopCopyKey; sub: ShopCopyKey; tone: string }[] = [
  { title: "soonFresh", sub: "soonFreshSub", tone: "grill-tile--whole" },
  { title: "soonBigchix", sub: "soonBigchixSub", tone: "grill-tile--prepared" },
  { title: "soonMomo", sub: "soonMomoSub", tone: "grill-tile--cuts" },
];

/** What customers see while the shop is closed or has nothing on sale. */
export function ShopComingSoon({ locale }: { locale: StoreLocale }) {
  const t = (k: ShopCopyKey) => shopT(locale, k);
  const notify = waMeHref(clevaMarketWhatsapp(), t("soonNotifyText"));
  return (
    <div className="store-wrap store-body pt-6">
      <section className="grill-soon">
        <p className="grill-kicker">{t("soonKicker")}</p>
        <h1 className="grill-display grill-soon-title">{t("soonTitle")}</h1>
        <p className="grill-soon-lead">{t("soonLead")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {notify ? (
            <a className="grill-cta mt-0" href={notify} target="_blank" rel="noreferrer">
              {t("soonNotify")}
            </a>
          ) : null}
          <Link className="grill-link" to={WHOLESALE_PATH}>
            {t("soonWholesale")} →
          </Link>
        </div>
      </section>
      <ul className="grill-soon-features">
        {FEATURES.map((f) => (
          <li key={f.title} className={`grill-tile ${f.tone}`}>
            <span className="grill-display grill-tile-name">{t(f.title)}</span>
            <span className="grill-tile-sub">{t(f.sub)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
