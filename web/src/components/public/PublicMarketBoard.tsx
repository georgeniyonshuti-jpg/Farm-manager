import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  fetchPublicLots,
  fetchPublicMarketSummary,
  type PublicLot,
  type PublicMarketSummary,
} from "../../api/publicMarket.api";
import { StoreBoardCard, StoreBoardGhosts } from "./StoreBoardCard";
import { StoreBoardFilters } from "./StoreBoardFilters";
import { StoreBoardHero } from "./StoreBoardHero";
import { StoreMarketBody } from "./StoreMarketBody";
import { StoreRequestSheet } from "./StoreRequestSheet";
import { StoreSellSheet } from "./StoreSellSheet";
import { usePublicBoard } from "../../hooks/usePublicBoard";
import { useAuth } from "../../auth/AuthContext";
import { canBrowseMarket, isBuyerRole } from "../../auth/permissions";
import { useOptionalMarketLocale } from "../../context/MarketLocaleContext";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import {
  defaultPublicMarketFilters,
  filtersToPublicLotsQuery,
  type PublicMarketFilters,
} from "../../lib/publicMarketFilters";
import { resolveUserCompanySlug, tenantPath } from "../../lib/tenancy";

export type PublicMarketBoardProps = {
  locale?: StoreLocale;
  variant?: "public" | "app";
};

export function PublicMarketBoard({
  locale: localeProp = "en",
  variant = "public",
}: PublicMarketBoardProps) {
  const marketLocale = useOptionalMarketLocale();
  const locale = marketLocale?.locale ?? localeProp;
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);

  const [filters, setFilters] = useState<PublicMarketFilters>(defaultPublicMarketFilters);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicLot[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [summary, setSummary] = useState<PublicMarketSummary | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestLot, setRequestLot] = useState<PublicLot | null>(null);
  const { board, ready } = usePublicBoard();

  const sellOpen = params.get("sell") === "1" || location.hash === "#list" || location.hash === "#sell";
  const filtered = Boolean(filters.district || filters.week || filters.minBirds || filters.service);
  const embedded = variant === "app";

  const partnerHref = useMemo(() => {
    if (embedded || !user || !canBrowseMarket(user)) return null;
    const slug = resolveUserCompanySlug(user);
    return slug ? tenantPath(slug, "market") : null;
  }, [embedded, user]);
  const showPartnerBanner = Boolean(partnerHref && isBuyerRole(user));

  const reloadShop = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      try {
        const lotsRes = await fetchPublicLots(filtersToPublicLotsQuery(filters, nextPage, 12));
        setItems((prev) => (append ? [...prev, ...lotsRes.items] : lotsRes.items));
        setHasMore(lotsRes.hasMore);
        setFilteredTotal(lotsRes.total);
        setPage(nextPage);
      } catch {
        if (!append) {
          setItems([]);
          setFilteredTotal(0);
          setHasMore(false);
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchPublicMarketSummary()
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void reloadShop(1, false);
  }, [reloadShop]);

  useEffect(() => {
    if (location.hash === "#request") {
      setRequestLot(null);
      setRequestOpen(true);
    }
    if (location.hash === "#how") {
      document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash]);

  function closeSell() {
    const next = new URLSearchParams(params);
    next.delete("sell");
    setParams(next, { replace: true });
  }

  return (
    <div className={embedded ? "pb-2" : undefined}>
      {showPartnerBanner && partnerHref ? (
        <div className="border-b border-[var(--store-line)] bg-[var(--store-card)]">
          <div className="store-wrap flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <p className="text-[var(--store-ink-soft)]">{t("partnerBanner")}</p>
            <Link to={partnerHref} className="store-text-link">
              {t("openMarket")}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="store-hero store-hero--rate" id="store-hero-edge">
        <StoreBoardHero
          board={board}
          ready={ready}
          summary={summary}
          locale={locale}
          onRequest={() => {
            setRequestLot(null);
            setRequestOpen(true);
          }}
        />
      </div>

      <section className="store-wrap store-board-section" aria-label={t("allLots")}>
        <StoreBoardFilters
          title={t("listingsThisWeek")}
          listed={items.length ? filteredTotal : 0}
          filters={filters}
          onChange={setFilters}
          districts={summary?.districts || []}
          locale={locale}
        />

        {items.length === 0 ? (
          <div className="store-lots-vacant" aria-label={filtered ? t("noMatches") : t("boardFills")}>
            {filtered ? <p className="store-board-status">{t("noMatches")}</p> : <StoreBoardGhosts locale={locale} />}
          </div>
        ) : (
          <div className="store-lots-grid" aria-label={t("readyNow")}>
            {items.map((lot) => (
              <StoreBoardCard
                key={lot.publicRef}
                lot={lot}
                locale={locale}
                onRequest={() => {
                  setRequestLot(lot);
                  setRequestOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {hasMore ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              className="store-text-link"
              disabled={loadingMore}
              onClick={() => void reloadShop(page + 1, true)}
            >
              {t("loadMore")}
            </button>
          </div>
        ) : null}
      </section>

      <StoreMarketBody
        locale={locale}
        side="buy"
        howFlavor="board"
        summary={summary}
        showCloseCta={false}
      />

      <StoreRequestSheet
        open={requestOpen}
        onClose={() => {
          setRequestOpen(false);
          setRequestLot(null);
        }}
        locale={locale}
        lot={requestLot}
        district={requestLot?.district || undefined}
      />
      <StoreSellSheet open={sellOpen} onClose={closeSell} locale={locale} />
    </div>
  );
}
