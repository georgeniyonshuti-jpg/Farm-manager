import type { MarketBoard } from "../../lib/marketQuote";
import { formatRwf, butcherPayFromBoard } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export type TripState = {
  birds: number;
  avgKg: number;
  slaughterPayer: "butcher" | "farm";
  delivery: boolean;
};

const TIER_COPY = {
  shop: "shopTier",
  usual: "usualTier",
  load: "loadTier",
} as const;

const FALLBACK_TIERS = [
  { id: "shop", label: "Shop", minBirds: 50, maxBirds: 99, fromRwfPerKg: null as number | null },
  { id: "usual", label: "Usual", minBirds: 100, maxBirds: 199, fromRwfPerKg: null as number | null },
  { id: "load", label: "Load", minBirds: 200, maxBirds: null, fromRwfPerKg: null as number | null },
];

function volumeTiers(board: MarketBoard | null) {
  if (board?.quantityTiers?.length) return board.quantityTiers;
  const minFrom = board?.bands?.length
    ? board.bands.reduce((m, b) => Math.min(m, b.fromRwfPerKg), Number.POSITIVE_INFINITY)
    : null;
  const adj = { shop: 0, usual: -50, load: -150 };
  return FALLBACK_TIERS.map((tier) => ({
    ...tier,
    fromRwfPerKg:
      minFrom != null && Number.isFinite(minFrom) ? minFrom + adj[tier.id as keyof typeof adj] : null,
  }));
}

export function StoreTripQuote({
  board,
  ready = true,
  locale,
  trip,
  onChange,
}: {
  board: MarketBoard | null;
  ready?: boolean;
  locale: StoreLocale;
  trip: TripState;
  onChange: (next: TripState) => void;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const hasBoard = ready && Boolean(board);
  const pay = hasBoard ? butcherPayFromBoard(board, trip) : null;
  const tiers = hasBoard ? volumeTiers(board) : [];
  const active = tiers.find((tier) => {
    const hi = tier.maxBirds == null ? Infinity : tier.maxBirds;
    return trip.birds >= tier.minBirds && trip.birds <= hi;
  });
  const next = tiers.find((tier) => tier.minBirds > trip.birds);
  const slaughterOn = trip.slaughterPayer === "butcher";

  return (
    <section className="store-trip" aria-label={t("thisTrip")}>
      <div className="store-trip-bar">
        <label>
          <span>{t("birds")}</span>
          <input
            type="number"
            min={1}
            value={trip.birds}
            onChange={(e) => onChange({ ...trip, birds: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label>
          <span>{t("tripKg")}</span>
          <input
            type="number"
            min={0.5}
            step={0.1}
            value={trip.avgKg}
            onChange={(e) => onChange({ ...trip, avgKg: Math.max(0.5, Number(e.target.value) || 1.8) })}
          />
        </label>
        <div className="store-trip-toggles">
          <button
            type="button"
            data-on={slaughterOn ? "true" : "false"}
            aria-pressed={slaughterOn}
            onClick={() => onChange({ ...trip, slaughterPayer: slaughterOn ? "farm" : "butcher" })}
          >
            {t("slaughter")}
          </button>
          <button
            type="button"
            data-on={trip.delivery ? "true" : "false"}
            aria-pressed={trip.delivery}
            onClick={() => onChange({ ...trip, delivery: !trip.delivery })}
          >
            {t("delivery")}
          </button>
        </div>
        <p className="store-trip-help">{t("tripHelp")}</p>
        {hasBoard ? (
          <p className="store-trip-pay">
            <span>{t("youPay")}</span>
            <strong className="tabular-nums">{pay ? formatRwf(pay.youPayRwf) : "—"}</strong>
            {pay ? <em className="tabular-nums">{formatRwf(pay.butcherRwfPerKg)}/{t("perKg").replace("RWF/", "")}</em> : null}
          </p>
        ) : ready ? (
          <p className="store-trip-hold">{t("holdThisRate")}</p>
        ) : null}
      </div>

      {hasBoard && tiers.length ? (
        <ul className="store-volume">
          {tiers.map((tier) => {
            const key = TIER_COPY[tier.id as keyof typeof TIER_COPY] || "usualTier";
            const on = active?.id === tier.id;
            const tierBirds = on ? trip.birds : tier.minBirds;
            const tierPay = butcherPayFromBoard(board, { ...trip, birds: tierBirds });
            return (
              <li key={tier.id} data-on={on ? "true" : "false"}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...trip, birds: tier.minBirds })}
                >
                  <span>{t(key)}</span>
                  <span className="store-volume-nums">
                    <strong className="tabular-nums">
                      {tier.fromRwfPerKg != null
                        ? `${formatRwf(tier.fromRwfPerKg)}/${t("perKg").replace("RWF/", "")}`
                        : "—"}
                    </strong>
                    {tierPay ? (
                      <em className="tabular-nums">
                        {formatRwf(tierPay.youPayRwf)} {t("thisTrip")}
                      </em>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasBoard && next && next.fromRwfPerKg != null ? (
        <p className="store-volume-nudge">
          {Math.max(0, next.minBirds - trip.birds)} {t("unlockNext")} {formatRwf(next.fromRwfPerKg)}/{t("perKg").replace("RWF/", "")}
        </p>
      ) : null}
    </section>
  );
}
