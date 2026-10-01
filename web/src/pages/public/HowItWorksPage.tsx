import { useOutletContext } from "react-router-dom";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { StoreCloseCta, StoreHowSteps } from "../../components/public/StoreMarketBody";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

type OutletCtx = { locale: StoreLocale };

export function HowItWorksPage() {
  const { locale } = useOutletContext<OutletCtx>();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  usePublicMeta(t("how"), t("howSub"));

  return (
    <div>
      <section className="store-hero" id="store-hero-edge">
        <div className="store-wrap relative z-10 py-12 sm:py-16">
          <p className="store-kicker">{t("live")}</p>
          <h1 className="store-display mt-3 max-w-4xl">{t("howTitle")}</h1>
          <p className="mt-3 max-w-xl text-[rgba(255,248,240,0.72)]">{t("howSub")}</p>
        </div>
      </section>
      <div className="store-wrap store-body">
        <StoreHowSteps locale={locale} side="buy" flavor="landing" heading={t("needBirds")} anchor />
        <StoreHowSteps locale={locale} side="sell" heading={t("gotBirds")} />
        <StoreCloseCta locale={locale} side="buy" href="/market#request" />
      </div>
    </div>
  );
}
