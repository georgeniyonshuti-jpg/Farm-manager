import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { writePreLoginLocale, type LaborerLocale } from "../i18n/laborerI18n";
import { type StoreLocale } from "../lib/publicStoreCopy";

type Ctx = {
  locale: StoreLocale;
  setLocale: (locale: StoreLocale) => void;
};

const MarketLocaleContext = createContext<Ctx | null>(null);

export function readStoreLocale(): StoreLocale {
  try {
    const v = localStorage.getItem("laborer_ui_locale") ?? sessionStorage.getItem("laborer_ui_locale");
    return v === "rw" ? "rw" : "en";
  } catch {
    return "en";
  }
}

export function MarketLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<StoreLocale>(readStoreLocale);
  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale: (next) => {
        setLocaleState(next);
        writePreLoginLocale(next as LaborerLocale);
      },
    }),
    [locale]
  );
  return <MarketLocaleContext.Provider value={value}>{children}</MarketLocaleContext.Provider>;
}

export function useMarketLocale(): Ctx {
  const ctx = useContext(MarketLocaleContext);
  if (!ctx) {
    throw new Error("useMarketLocale requires MarketLocaleProvider");
  }
  return ctx;
}

export function useOptionalMarketLocale(): Ctx | null {
  return useContext(MarketLocaleContext);
}
