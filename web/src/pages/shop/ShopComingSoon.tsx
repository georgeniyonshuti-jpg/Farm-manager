import { ArrowRight, Drumstick, Flame, Smartphone } from "lucide-react";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import { shopT, type ShopCopyKey } from "./shopCopy";

const FEATURES: { title: ShopCopyKey; sub: ShopCopyKey; Icon: typeof Flame }[] = [
  { title: "soonFresh", sub: "soonFreshSub", Icon: Drumstick },
  { title: "soonBigchix", sub: "soonBigchixSub", Icon: Flame },
  { title: "soonMomo", sub: "soonMomoSub", Icon: Smartphone },
];

/** What customers see while the shop is closed or has nothing on sale. */
export function ShopComingSoon({ locale }: { locale: StoreLocale }) {
  const t = (k: ShopCopyKey) => shopT(locale, k);
  const notify = waMeHref(clevaMarketWhatsapp(), t("soonNotifyText"));
  return (
    <div className="store-wrap store-body sh-page">
      <section className="sh-soon">
        <span className="sh-hero-art" aria-hidden="true" />
        <span className="sh-hero-shade" aria-hidden="true" />
        <div className="sh-soon-body">
          <p className="sh-kicker">{t("soonKicker")}</p>
          <h1 className="grill-display sh-soon-title">{t("soonTitle")}</h1>
          <p className="sh-hero-lead">{t("soonLead")}</p>
          {notify ? (
            <a className="sh-cta" href={notify} target="_blank" rel="noreferrer">
              {t("soonNotify")}
              <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
            </a>
          ) : null}
        </div>
      </section>
      <ul className="sh-features">
        {FEATURES.map(({ title, sub, Icon }) => (
          <li key={title}>
            <span className="sh-feature-icon">
              <Icon size={20} aria-hidden />
            </span>
            <div>
              <p className="sh-feature-title">{t(title)}</p>
              <p className="sh-feature-sub">{t(sub)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
