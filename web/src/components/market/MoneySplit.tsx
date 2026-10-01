import { formatRwf } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export type MoneySplitLine = {
  key: string;
  labelKey?: string;
  label?: string;
  rwf: number;
  pct?: number;
};

export type BuyerMoneySplit = {
  youPayRwf: number;
  buyerRwfPerKg?: number | null;
  lines: MoneySplitLine[];
};

export type FarmerMoneySplit = {
  youReceiveRwf: number;
  farmGateRwfPerKg?: number | null;
  servicePct?: number;
  lines: MoneySplitLine[];
};

const BUYER_LINE_KEYS = [
  "splitFarmer",
  "splitService",
  "splitProcessing",
  "splitTransport",
  "splitFarmDelivery",
  "splitClevaDelivery",
] as const;
const FARMER_LINE_KEYS = ["splitFarmGross", "splitFarmService", "splitFarmVisit", "splitFarmProcessing"] as const;

function lineLabel(locale: StoreLocale, line: MoneySplitLine) {
  if (line.label) return line.label;
  const known = [...BUYER_LINE_KEYS, ...FARMER_LINE_KEYS].find((key) => key === line.labelKey);
  if (known) return storeT(locale, known);
  if (line.labelKey) return storeT(locale, line.labelKey as Parameters<typeof storeT>[1]);
  return line.key;
}

export function BuyerMoneySplitView({
  split,
  locale,
}: {
  split: BuyerMoneySplit;
  locale: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  return (
    <div className="store-money-split" aria-label={t("splitSee")}>
      <p className="store-money-total">
        <span>{t("splitYouPay")}</span>
        <strong className="tabular-nums">{formatRwf(split.youPayRwf)}</strong>
      </p>
      {split.buyerRwfPerKg != null ? (
        <p className="store-money-kg tabular-nums">
          {formatRwf(split.buyerRwfPerKg)}/{t("perKg").replace("RWF/", "")}
        </p>
      ) : null}
      <ul>
        {split.lines.map((line) => (
          <li key={line.key}>
            <span>{lineLabel(locale, line)}</span>
            <span className="tabular-nums">{formatRwf(line.rwf)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FarmerMoneySplitView({
  split,
  locale,
}: {
  split: FarmerMoneySplit;
  locale: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  return (
    <div className="store-money-split" aria-label={t("splitSee")}>
      <p className="store-money-total">
        <span>{t("splitYouReceive")}</span>
        <strong className="tabular-nums">{formatRwf(split.youReceiveRwf)}</strong>
      </p>
      {split.farmGateRwfPerKg != null ? (
        <p className="store-money-kg tabular-nums">
          {formatRwf(split.farmGateRwfPerKg)}/{t("perKg").replace("RWF/", "")}
          {split.servicePct ? ` · ${split.servicePct}% ${t("splitFarmService")}` : ""}
        </p>
      ) : null}
      <ul>
        {split.lines.map((line) => (
          <li key={line.key}>
            <span>
              {lineLabel(locale, line)}
              {line.pct ? ` (${line.pct}%)` : ""}
            </span>
            <span className="tabular-nums">{formatRwf(line.rwf)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
