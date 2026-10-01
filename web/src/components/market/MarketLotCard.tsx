import { Link } from "react-router-dom";
import type { PublicLot } from "../../api/publicMarket.api";
import { formatPriceBand, formatWeightBand } from "../../lib/publicMarketFilters";
import { StatusPill } from "../ui";

const cardClass =
  "flex flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] transition hover:border-[var(--primary-color)]/40";

export function MarketLotCard({
  lot,
  cta,
  to,
  preview = false,
  verified = false,
  hideRef = false,
}: {
  lot: PublicLot;
  cta: string;
  to: string;
  preview?: boolean;
  verified?: boolean;
  hideRef?: boolean;
}) {
  const inner = (
    <>
      <div className="relative aspect-[16/10] bg-[var(--surface-subtle)]">
        {lot.coverUrl ? (
          <img src={lot.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end p-card">
            <p className="type-title text-[var(--text-primary)]">
              {lot.birdsAvailable.toLocaleString()} birds
            </p>
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {verified ? <StatusPill tone="success">Verified</StatusPill> : null}
          {lot.farm ? <StatusPill tone="info">{lot.farm.displayName}</StatusPill> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-card">
        <div>
          <p className="type-title text-[var(--text-primary)]">
            {lot.title || lot.district || "Rwanda"}
          </p>
          {!hideRef && lot.publicRef ? (
            <p className="font-mono type-caption text-[var(--text-muted)]">{lot.publicRef}</p>
          ) : null}
        </div>
        <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
          {lot.birdsAvailable.toLocaleString()}{" "}
          <span className="text-base font-normal text-[var(--text-secondary)]">birds</span>
        </p>
        <dl className="grid grid-cols-2 gap-2 type-caption text-[var(--text-secondary)]">
          <div>
            <dt className="text-[var(--text-muted)]">Ready</dt>
            <dd>{lot.readyLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Weight</dt>
            <dd>{formatWeightBand(lot.weightBandKg)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[var(--text-muted)]">Price band</dt>
            <dd className="font-medium text-[var(--text-primary)]">{formatPriceBand(lot.priceBandRwf)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-1.5">
          {lot.slaughterAvailable ? <StatusPill tone="info">Slaughter</StatusPill> : null}
          {lot.deliveryAvailable ? <StatusPill tone="neutral">Delivery</StatusPill> : null}
        </div>
        {cta ? (
          <span className="mt-auto type-body font-semibold text-[var(--primary-color)]">{cta} →</span>
        ) : null}
      </div>
    </>
  );
  if (preview) {
    return <div className={cardClass}>{inner}</div>;
  }
  return (
    <Link to={to} className={cardClass}>
      {inner}
    </Link>
  );
}
