import { useEffect, useState } from "react";
import { fetchPublicBoard } from "../api/publicMarket.api";
import { envMarketWhatsapp, normalizeMarketWhatsapp } from "../lib/marketWhatsapp";
import type { MarketBoard } from "../lib/marketQuote";

export function usePublicBoard() {
  const [board, setBoard] = useState<MarketBoard | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(envMarketWhatsapp);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchPublicBoard()
      .then((r) => {
        if (cancelled) return;
        setBoard(r.board);
        setWhatsapp(normalizeMarketWhatsapp(r.whatsapp) || envMarketWhatsapp());
      })
      .catch(() => {
        if (cancelled) return;
        setBoard(null);
        setWhatsapp(envMarketWhatsapp());
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { board, whatsapp, ready };
}
