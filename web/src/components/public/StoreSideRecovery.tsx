import { Link } from "react-router-dom";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreSideRecovery({
  locale,
  side,
  tone = "ink",
}: {
  locale: StoreLocale;
  side: "buy" | "sell";
  tone?: "ink" | "light";
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const muted = tone === "light" ? "text-[rgba(255,248,240,0.72)]" : "text-[var(--store-ink-soft)]";
  const linkClass = tone === "light" ? "store-text-link !text-[var(--store-gold)]" : "store-text-link";

  if (side === "buy") {
    return (
      <p className={`text-sm ${muted}`}>
        {t("forFarmsLine")}{" "}
        <Link to="/market?sell=1" className={linkClass}>
          {t("listBirds")}
        </Link>
      </p>
    );
  }

  return (
    <p className={`text-sm ${muted}`}>
      {t("buyInstead")}{" "}
      <Link to="/market" className={linkClass}>
        {t("request")}
      </Link>
    </p>
  );
}
