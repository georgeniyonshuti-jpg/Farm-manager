import { useEffect } from "react";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { StoreSellForm } from "./StoreSellForm";

export function StoreSellSheet({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);

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
      <div role="dialog" aria-modal="true" aria-label={t("listBirds")} className="store-sheet">
        <div className="store-sheet-handle" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-[var(--font-display)] text-2xl font-extrabold leading-tight">{t("listBirds")}</h2>
          <button type="button" className="store-sheet-x" onClick={onClose} aria-label={t("close")}>
            ✕
          </button>
        </div>
        <div className="relative mt-5">
          <StoreSellForm locale={locale} />
        </div>
      </div>
    </div>
  );
}
