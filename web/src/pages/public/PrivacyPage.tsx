import { useOutletContext } from "react-router-dom";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

type OutletCtx = { locale: StoreLocale };

export function PrivacyPage() {
  const { locale } = useOutletContext<OutletCtx>();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  usePublicMeta(t("privacyTitle"), t("privacyLead"));

  return (
    <div className="store-wrap store-body">
      <article className="store-section max-w-2xl">
        <h1 className="store-section-title">{t("privacyTitle")}</h1>
        <p className="text-[var(--store-ink)]">{t("privacyLead")}</p>

        <h2 className="store-section-title mt-8">{t("privacyCollectTitle")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-[var(--store-ink)]">
          <li>{t("privacyCollectWa")}</li>
          <li>{t("privacyCollectSignup")}</li>
          <li>{t("privacyCollectFlock")}</li>
          <li>{t("privacyCollectSite")}</li>
        </ul>

        <h2 className="store-section-title mt-8">{t("privacyUseTitle")}</h2>
        <p className="text-[var(--store-ink)]">{t("privacyUseBody")}</p>
        <p className="mt-3 text-[var(--store-ink)]">{t("privacyPublic")}</p>

        <h2 className="store-section-title mt-8">{t("privacyShareTitle")}</h2>
        <p className="text-[var(--store-ink)]">{t("privacyShareBody")}</p>

        <h2 className="store-section-title mt-8">{t("privacyKeepTitle")}</h2>
        <p className="text-[var(--store-ink)]">{t("privacyKeepBody")}</p>

        <h2 className="store-section-title mt-8">{t("privacyDeleteTitle")}</h2>
        <p className="text-[var(--store-ink)]">{t("privacyDeleteBody")}</p>

        <h2 className="store-section-title mt-8">{t("privacyContactTitle")}</h2>
        <p className="text-[var(--store-ink)]">
          {t("privacyContactName")}
          <br />
          <a className="underline" href={`mailto:${t("privacyContactEmail")}`}>
            {t("privacyContactEmail")}
          </a>
          <br />
          <a className="underline" href="https://market.cleva.rw">
            https://market.cleva.rw
          </a>
        </p>
      </article>
    </div>
  );
}
