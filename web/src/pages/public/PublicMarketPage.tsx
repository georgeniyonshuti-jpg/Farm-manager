import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { type PublicOutletCtx } from "../../components/public/PublicLayout";
import { PublicMarketBoard } from "../../components/public/PublicMarketBoard";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { recordMarketReach } from "../../lib/marketReach";
import { storeT } from "../../lib/publicStoreCopy";

export function PublicMarketPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  usePublicMeta(storeT("en", "storeBrand"), storeT("en", "landingSub"));
  useEffect(() => {
    recordMarketReach("opened", window.location.search);
  }, []);

  return (
    <PublicMarketBoard
      locale={locale}
      variant="public"
    />
  );
}
