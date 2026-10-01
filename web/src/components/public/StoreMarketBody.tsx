import { Link } from "react-router-dom";
import { type PublicMarketSummary } from "../../api/publicMarket.api";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { StoreSideRecovery } from "./StoreSideRecovery";

export type StoreSide = "buy" | "sell";
export type StoreHowFlavor = "landing" | "shop" | "board";

type CopyKey = Parameters<typeof storeT>[1];

function tFor(locale: StoreLocale) {
  return (k: CopyKey) => storeT(locale, k);
}

const BUY_LANDING_STEPS: Array<[CopyKey, CopyKey]> = [
  ["landingHow1t", "landingHow1"],
  ["landingHow2t", "landingHow2"],
  ["landingHow3t", "landingHow3"],
];

const BOARD_STEPS: Array<[CopyKey, CopyKey]> = [
  ["boardHow1t", "boardHow1"],
  ["boardHow2t", "boardHow2"],
  ["boardHow3t", "boardHow3"],
];

const BUY_SHOP_STEPS: Array<[CopyKey, CopyKey]> = [
  ["how1t", "how1"],
  ["how2t", "how2"],
  ["how3t", "how3"],
  ["how4t", "how4"],
];

const SELL_STEPS: Array<[CopyKey, CopyKey]> = [
  ["sell1", "sell1b"],
  ["sell2", "sell2b"],
  ["sell3", "sell3b"],
];

const BUY_FAQ: Array<[CopyKey, CopyKey]> = [
  ["faqAccountQ", "faqAccountA"],
  ["faqPayQ", "faqPayA"],
  ["faqProcessQ", "faqProcessA"],
  ["faqEmptyQ", "faqEmptyA"],
];

const SELL_FAQ: Array<[CopyKey, CopyKey]> = [
  ["faqTakeQ", "faqTakeA"],
  ["faqWhenSeenQ", "faqWhenSeenA"],
  ["faqFarmAppQ", "faqFarmAppA"],
];

function proofItems(locale: StoreLocale, summary?: PublicMarketSummary | null) {
  if (!summary) return [];
  const t = tFor(locale);
  const items: Array<{ value: number; label: string }> = [];
  if (summary.birdsThisWeek > 0) {
    items.push({ value: summary.birdsThisWeek, label: t("proofBirdsWeek") });
  }
  if (summary.farmsVerified > 0) {
    items.push({ value: summary.farmsVerified, label: t("proofFarms") });
  }
  if (summary.districtsSupplying > 0) {
    items.push({ value: summary.districtsSupplying, label: t("proofDistricts") });
  }
  return items;
}

export function StoreHeroLead({ locale, side }: { locale: StoreLocale; side: StoreSide }) {
  const t = tFor(locale);
  const kicker = side === "buy" ? t("needBirdsWho") : t("gotBirdsWho");
  const title = side === "buy" ? t("landingHero") : t("sellTitle");
  const trust =
    side === "buy"
      ? [t("trustNoAccount"), t("trustWeCall"), t("trustPayScale")]
      : [t("trustLeaveNumber"), t("trustListAfterCheck"), t("trustNoSoftware")];

  return (
    <div className="store-hero-copy">
      <p className="store-kicker">{kicker}</p>
      <h1 className="store-display">{title}</h1>
      <p className="store-hero-lead">{side === "buy" ? t("emptyBody") : t("sellSub")}</p>
      <ul className="store-trust store-trust-hero">
        {trust.map((label) => (
          <li key={label} className="store-trust-item">
            <span className="store-trust-dot" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
      <div className="store-hero-switch">
        <StoreSideRecovery locale={locale} side={side} tone="light" />
      </div>
    </div>
  );
}

export function StoreHowSteps({
  locale,
  side,
  flavor = "landing",
  anchor = false,
  heading,
}: {
  locale: StoreLocale;
  side: StoreSide;
  flavor?: StoreHowFlavor;
  anchor?: boolean;
  heading?: string;
}) {
  const t = tFor(locale);
  const steps =
    side === "sell" ? SELL_STEPS : flavor === "shop" ? BUY_SHOP_STEPS : flavor === "board" ? BOARD_STEPS : BUY_LANDING_STEPS;
  const title = heading ?? (flavor === "board" ? t("howMarket") : t("howTitle"));

  const process = flavor === "board";

  return (
    <section className="store-section" id={anchor ? "how" : undefined} aria-labelledby={anchor ? "store-how" : undefined}>
      <h2 id={anchor ? "store-how" : undefined} className="store-section-title">
        {title}
      </h2>
      <div className={process ? "store-how-process" : "store-how-grid"} data-cols={String(steps.length)}>
        {steps.map(([titleKey, bodyKey], i) => (
          <article key={titleKey} className={process ? "store-how-step" : "store-card store-how-card"}>
            <p className="store-how-num">0{i + 1}</p>
            <h3 className="store-how-title">{t(titleKey)}</h3>
            <p className="store-how-body">{t(bodyKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StoreProofStrip({
  locale,
  summary,
}: {
  locale: StoreLocale;
  summary?: PublicMarketSummary | null;
}) {
  const items = proofItems(locale, summary);
  if (items.length === 0) return null;

  return (
    <section className="store-proof" aria-label={storeT(locale, "thisWeeksBoard")}>
      {items.map((item) => (
        <p key={item.label} className="store-proof-item">
          <strong className="store-proof-value">{item.value}</strong>
          <span>{item.label}</span>
        </p>
      ))}
    </section>
  );
}

export function StoreFaq({
  locale,
  side,
  quiet = false,
}: {
  locale: StoreLocale;
  side: StoreSide;
  quiet?: boolean;
}) {
  const t = tFor(locale);
  const items = side === "buy" ? BUY_FAQ : SELL_FAQ;

  return (
    <section className="store-section" aria-labelledby={`store-faq-${side}`}>
      <h2 id={`store-faq-${side}`} className={quiet ? "store-faq-kicker" : "store-section-title"}>
        {t("faqTitle")}
      </h2>
      <div className="store-faq">
        {items.map(([q, a]) => (
          <details key={q} className="store-faq-item">
            <summary>{t(q)}</summary>
            <p>{t(a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function StoreCloseCta({
  locale,
  side,
  href,
  onClick,
}: {
  locale: StoreLocale;
  side: StoreSide;
  href?: string;
  onClick?: () => void;
}) {
  const t = tFor(locale);
  const label = side === "buy" ? t("navRequest") : t("listBirds");
  const to = href || (side === "buy" ? "/market#request" : "/market?sell=1");

  return (
    <section className="store-close">
      {onClick ? (
        <button type="button" className="store-btn store-btn-ember" onClick={onClick}>
          {label}
        </button>
      ) : to.startsWith("#") ? (
        <a href={to} className="store-btn store-btn-ember">
          {label}
        </a>
      ) : (
        <Link to={to} className="store-btn store-btn-ember">
          {label}
        </Link>
      )}
    </section>
  );
}

export function StoreMarketBody({
  locale,
  side,
  summary,
  onRequest,
  variant = "full",
  howFlavor,
  showCloseCta = true,
}: {
  locale: StoreLocale;
  side: StoreSide;
  summary?: PublicMarketSummary | null;
  onRequest?: () => void;
  variant?: "full" | "how";
  howFlavor?: StoreHowFlavor;
  showCloseCta?: boolean;
}) {
  const t = tFor(locale);
  const flavor = howFlavor ?? "landing";

  const extras =
    variant === "full" ? (
      <>
        <StoreFaq locale={locale} side={side} />
        {side === "sell" ? (
          <p className="store-os">
            {t("sellOsHint")}{" "}
            <Link to="/signup?from=market&accountType=farmer" className="store-text-link">
              {t("sellOsLink")}
            </Link>
          </p>
        ) : null}
      </>
    ) : null;

  const body = (
    <div className={`store-wrap store-body${flavor === "board" ? " store-body-board" : ""}`}>
      <StoreProofStrip locale={locale} summary={summary} />
      <StoreHowSteps locale={locale} side={side} flavor={flavor} anchor />
      {flavor === "board" ? null : extras}
      {showCloseCta ? (
        <StoreCloseCta locale={locale} side={side} href="#request" onClick={onRequest} />
      ) : null}
    </div>
  );

  if (flavor === "board") {
    return (
      <div className="store-explain">
        <div className="store-wrap">
          <div className="store-explain-stage">
            <StoreProofStrip locale={locale} summary={summary} />
            <StoreHowSteps locale={locale} side={side} flavor={flavor} anchor />
            {variant === "full" ? <StoreFaq locale={locale} side={side} quiet /> : null}
            {showCloseCta ? (
              <StoreCloseCta locale={locale} side={side} href="#request" onClick={onRequest} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return body;
}
