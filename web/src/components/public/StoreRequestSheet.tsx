import { useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { isBuyerRole } from "../../auth/permissions";
import type { PublicLot } from "../../api/publicMarket.api";
import { MarketCheckout } from "../market/MarketCheckout";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { StoreRequestForm } from "./StoreRequestForm";

export function StoreRequestSheet({
  open,
  onClose,
  locale,
  lot,
  district,
}: {
  open: boolean;
  onClose: () => void;
  locale: StoreLocale;
  lot?: PublicLot | null;
  district?: string;
}) {
  const { user } = useAuth();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const checkout = Boolean(lot && isBuyerRole(user));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="store-sheet-root">
      <button type="button" className="store-sheet-backdrop" aria-label={t("close")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={lot ? t("requestThese") : t("request")}
        className="store-sheet"
      >
        <div className="store-sheet-handle" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[var(--font-display)] text-2xl font-extrabold leading-tight">
              {checkout ? t("payToConfirm") : lot ? t("requestThese") : t("request")}
            </h2>
            {lot ? (
              <p className="mt-1 text-sm text-[var(--store-muted)]">
                {lot.birdsAvailable.toLocaleString()} {t("birds")}
                {lot.district ? ` · ${lot.district}` : ""}
              </p>
            ) : null}
          </div>
          <button type="button" className="store-sheet-x" onClick={onClose} aria-label={t("close")}>
            ✕
          </button>
        </div>
        <div className="relative mt-5">
          {checkout && lot ? (
            <MarketCheckout locale={locale} lot={lot} onDone={onClose} />
          ) : (
            <StoreRequestForm locale={locale} lot={lot} district={district} extras onDone={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
