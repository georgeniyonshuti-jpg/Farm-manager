import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { fetchPublicLot, trackPublicMarketEvent, type PublicLot } from "../../api/publicMarket.api";
import { StoreGallery } from "../../components/public/StoreGallery";
import { StoreRequestSheet } from "../../components/public/StoreRequestSheet";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { useStickyAfterHero } from "../../hooks/useStickyAfterHero";
import { formatPriceBand, formatWeightBand } from "../../lib/publicMarketFilters";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

type OutletCtx = { locale: StoreLocale };

export function PublicLotDetailPage() {
  const { publicRef = "" } = useParams<{ publicRef: string }>();
  const { locale } = useOutletContext<OutletCtx>();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  usePublicMeta(
    lot ? `${lot.title || lot.district || "Lot"} · ${lot.publicRef}` : "Market listing",
    storeT("en", "landingSub")
  );
  const showSticky = useStickyAfterHero(Boolean(lot));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPublicLot(publicRef)
      .then((r) => {
        if (!cancelled) setLot(r.lot);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("missingLot"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicRef]);

  if (loading) {
    return <div className="store-wrap py-16"><div className="store-card h-96 animate-pulse bg-[#e8ddd0]" /></div>;
  }
  if (error || !lot) {
    return (
      <div className="store-wrap space-y-4 py-16">
        <p className="font-[var(--font-display)] text-3xl font-extrabold">{t("missingLot")}</p>
        <Link to="/market" className="store-btn store-btn-ghost">{t("back")}</Link>
      </div>
    );
  }

  const gallery = lot.media?.length
    ? lot.media
    : lot.coverUrl
      ? [{ url: lot.coverUrl, purpose: "cover", caption: null }]
      : lot.farm?.media || [];

  return (
    <div className="pb-28 lg:pb-16">
      <div className="store-wrap grid gap-10 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:py-12">
        <div className="space-y-6">
          <Link to="/market" className="text-sm font-bold text-[var(--store-ember)]">
            ← {t("back")}
          </Link>
          <StoreGallery
            items={gallery}
            alt={lot.title || lot.publicRef}
            fallback={{ district: lot.district, birds: lot.birdsAvailable, label: t("birds") }}
          />
        </div>
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--store-moss)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              {t("verified")}
            </span>
            <span className="rounded-full bg-[var(--store-paper)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--store-ink-soft)]">
              {lot.farm ? lot.farm.displayName : t("brokered")}
            </span>
          </div>
          <h1 className="store-display text-[2.6rem] sm:text-5xl">
            {lot.title || `${lot.birdsAvailable.toLocaleString()} ${t("birds")}`}
          </h1>
          <p className="text-2xl font-semibold text-[var(--store-ember)]">
            {lot.priceBandRwf ? formatPriceBand(lot.priceBandRwf) : t("priceOnRequest")}
          </p>
          <p className="text-[var(--store-muted)]">
            {lot.district || "Rwanda"} · {lot.readyLabel || t("ready")} · {formatWeightBand(lot.weightBandKg)}
          </p>
          {lot.story ? <p className="leading-relaxed text-[var(--store-ink-soft)]">{lot.story}</p> : null}

          {lot.farm ? (
            <Link
              to={`/market/farm/${encodeURIComponent(lot.farm.slug)}`}
              className="store-card flex items-center justify-between p-4 no-underline"
            >
              <div>
                <p className="font-bold">{lot.farm.displayName}</p>
                <p className="text-sm text-[var(--store-muted)]">{lot.farm.locationLabel || lot.farm.district}</p>
              </div>
              <span className="text-sm font-bold text-[var(--store-ember)]">→</span>
            </Link>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Spec label={t("birds")} value={lot.birdsAvailable.toLocaleString()} />
            <Spec label={t("ready")} value={lot.readyLabel || "—"} />
            <Spec label={t("slaughter")} value={lot.slaughterAvailable ? t("chipSlaughter") : t("processLive")} />
            <Spec
              label={t("handover")}
              value={lot.deliveryAvailable ? t("chipFarmDelivery") : t("chipCollectLive")}
            />
          </dl>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--store-gold)]">{t("nextSteps")}</p>
            <ol className="space-y-2 text-sm leading-relaxed text-[var(--store-ink-soft)]">
              <li>1. {t("how2")}</li>
              <li>2. {t("how3")}</li>
              <li>3. {t("how4")}</li>
            </ol>
          </div>

          <button
            type="button"
            className="store-btn store-btn-ember"
            onClick={() => {
              setOpen(true);
              void trackPublicMarketEvent({ eventType: "request_started", publicRef: lot.publicRef });
            }}
          >
            {t("requestThese")}
          </button>
        </div>
      </div>

      {showSticky ? (
        <div className="store-sticky-bar lg:hidden">
          <button
            type="button"
            className="store-btn store-btn-ember w-full"
            onClick={() => {
              setOpen(true);
              void trackPublicMarketEvent({ eventType: "request_started", publicRef: lot.publicRef });
            }}
          >
            {t("requestThese")}
          </button>
        </div>
      ) : null}

      <StoreRequestSheet open={open} onClose={() => setOpen(false)} locale={locale} lot={lot} />
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--store-card)] p-4">
      <dt className="text-xs uppercase tracking-wide text-[var(--store-muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
