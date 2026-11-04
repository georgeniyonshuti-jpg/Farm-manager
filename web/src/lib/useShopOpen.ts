import { useEffect, useState } from "react";
import { fetchShopCatalog } from "../api/shop.api";

let pending: Promise<boolean> | null = null;
let known: boolean | null = null;

function loadShopOpen(): Promise<boolean> {
  if (!pending) {
    pending = fetchShopCatalog()
      .then((c) => c.open && c.products.length > 0)
      .catch(() => false)
      .then((open) => {
        known = open;
        return open;
      });
  }
  return pending;
}

/**
 * Whether the chicken shop is open and has something on sale.
 * Null while loading. One request per page load, shared by every caller.
 */
export function useShopOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(known);
  useEffect(() => {
    if (known !== null) return;
    let cancelled = false;
    void loadShopOpen().then((v) => !cancelled && setOpen(v));
    return () => {
      cancelled = true;
    };
  }, []);
  return open;
}
