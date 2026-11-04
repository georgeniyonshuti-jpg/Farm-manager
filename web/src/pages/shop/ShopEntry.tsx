import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { fetchShopCatalog } from "../../api/shop.api";
import { shopT } from "./shopCopy";

/** Market home entry to the chicken shop. Shows only while the shop is open. */
export function ShopEntry({ locale }: { locale: StoreLocale }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchShopCatalog()
      .then((c) => !cancelled && setOpen(c.open && c.products.length > 0))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!open) return null;
  return (
    <div className="store-wrap pt-6">
      <Link
        to="/market/shop"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-4 no-underline"
      >
        <span>
          <span className="block font-semibold text-[var(--store-ink)]">{shopT(locale, "orderCta")}</span>
          <span className="block text-sm text-[var(--store-muted)]">{shopT(locale, "orderCtaSub")}</span>
        </span>
        <span className="store-btn store-btn-ember">→</span>
      </Link>
    </div>
  );
}
