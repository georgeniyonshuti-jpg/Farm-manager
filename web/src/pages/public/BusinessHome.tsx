import { useEffect, type ReactNode } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { Check, MessageCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { canBrowseMarket } from "../../auth/permissions";
import type { PublicOutletCtx } from "../../components/public/PublicLayout";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { recordMarketReach } from "../../lib/marketReach";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { resolveUserCompanySlug, tenantPath } from "../../lib/tenancy";

// English only for now; Kinyarwanda falls back to English until a native speaker fills it in.
const en = {
  kicker: "Cleva Market · For businesses",
  title: "Chicken supply for your business.",
  lead: "Live and dressed birds from farms across Rwanda, for butchers, restaurants, hotels and traders. Log in to see this week's prices and order.",
  login: "Log in",
  signup: "Create a business account",
  whatsapp: "Chat on WhatsApp",
  waText: "Hello Cleva, I buy chicken for my business and would like to know more.",
  stepsTitle: "How it works",
  step1Title: "Open a business account",
  step1Body: "Tell us who you are and what you buy. It takes two minutes.",
  step2Title: "See this week's birds",
  step2Body: "Live and dressed birds from farms across Rwanda, with one clear price per kilo.",
  step3Title: "Order, then collect or get delivery",
  step3Body: "Confirm and pay with Cleva. We check the weight when the birds are handed over.",
  trust1: "Farms across Rwanda",
  trust2: "New prices every week",
  trust3: "Weight checked at handover",
  sellAsk: "Have birds to sell?",
  sellLink: "Sell with Cleva",
  meta: "Live and dressed birds for butchers, restaurants, hotels and traders in Rwanda.",
};
type Key = keyof typeof en;
const rw: Partial<Record<Key, string>> = {};
const tr = (locale: StoreLocale, k: Key) => (locale === "rw" ? rw[k] : undefined) ?? en[k];

/** Where a signed-in person goes from the market home: the buyer board, or their own home. */
function signedInHome(user: NonNullable<ReturnType<typeof useAuth>["user"]>): string {
  return tenantPath(resolveUserCompanySlug(user), canBrowseMarket(user) ? "market" : "");
}

/** Business pages need an account. Signed-out visitors see the welcome page instead. */
export function BusinessOnly({ children }: { children: ReactNode }) {
  const { user, bootstrapped } = useAuth();
  if (!bootstrapped) return <div className="store-wrap store-body" aria-busy="true" />;
  if (!user) return <BusinessWelcome />;
  return <>{children}</>;
}

/** market.cleva.rw: signed-in buyers go to the board; everyone else sees the welcome page. */
export function BusinessHome() {
  const { user, bootstrapped } = useAuth();
  if (!bootstrapped) return <div className="store-wrap store-body" aria-busy="true" />;
  if (user) return <Navigate to={signedInHome(user)} replace />;
  return <BusinessWelcome />;
}

function BusinessWelcome() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const t = (k: Key) => tr(locale, k);
  usePublicMeta("Cleva Market", t("meta"));
  useEffect(() => {
    recordMarketReach("opened", window.location.search);
  }, []);
  const wa = waMeHref(clevaMarketWhatsapp(), t("waText"));
  const steps: [Key, Key][] = [
    ["step1Title", "step1Body"],
    ["step2Title", "step2Body"],
    ["step3Title", "step3Body"],
  ];

  return (
    <div className="store-wrap store-body biz">
      <section className="biz-hero">
        <div className="biz-intro">
          <p className="biz-kicker">{t("kicker")}</p>
          <h1 className="biz-title">{t("title")}</h1>
          <p className="biz-lead">{t("lead")}</p>
          <div className="biz-actions">
            <Link className="biz-btn biz-btn--primary" to="/login">
              {t("login")}
            </Link>
            <Link className="biz-btn biz-btn--outline" to="/signup?from=market">
              {t("signup")}
            </Link>
          </div>
          {wa ? (
            <a className="biz-wa" href={wa} target="_blank" rel="noreferrer">
              <MessageCircle size={18} aria-hidden />
              {t("whatsapp")}
            </a>
          ) : null}
          <ul className="biz-trust">
            {(["trust1", "trust2", "trust3"] as Key[]).map((k) => (
              <li key={k}>
                <Check size={16} strokeWidth={2.6} aria-hidden />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>

        <div className="biz-steps">
          <p className="biz-steps-title">{t("stepsTitle")}</p>
          <ol>
            {steps.map(([title, body], i) => (
              <li key={title}>
                <span className="biz-step-num">{i + 1}</span>
                <div>
                  <p className="biz-step-title">{t(title)}</p>
                  <p className="biz-step-body">{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <p className="biz-sell">
        {t("sellAsk")}{" "}
        <Link to="/market/sell">{t("sellLink")} →</Link>
      </p>
    </div>
  );
}
