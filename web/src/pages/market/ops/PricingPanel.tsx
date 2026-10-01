import { useCallback, useEffect, useMemo, useState } from "react";
import { Field, Input, Button, StatusPill } from "../../../components/ui";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import {
  fetchMarketRates,
  publishMarketRate,
  saveMarketRateDraft,
  saveVisitFee,
  type MarketRateCard,
} from "../../../api/pipeline.api";
import { formatRwf, previewFromDraft } from "../../../lib/marketQuote";
import { demoRatesPayload, isMarketDemoEligibleError } from "./demoMarketData";
import { useMarketDemoFlag } from "./useMarketDemoFlag";

type BandRow = MarketRateCard["bands"][number];
type TierRow = NonNullable<MarketRateCard["quantityTiers"]>[number];

function emptyBand(): BandRow {
  return { minKg: 1.6, maxKg: 1.8, farmGateRwfPerKg: 3800, butcherRwfPerKg: 4300 };
}

const DEFAULT_QUANTITY_TIERS: TierRow[] = [
  { id: "kitchen", minBirds: 10, maxBirds: 49, label: "Kitchen", farmGateAdjRwf: 0, butcherAdjRwf: 150 },
  { id: "shop", minBirds: 50, maxBirds: 99, label: "Shop", farmGateAdjRwf: 0, butcherAdjRwf: 0 },
  { id: "usual", minBirds: 100, maxBirds: 199, label: "Usual", farmGateAdjRwf: -30, butcherAdjRwf: -50 },
  { id: "load", minBirds: 200, maxBirds: null, label: "Load", farmGateAdjRwf: -80, butcherAdjRwf: -150 },
];

type Props = {
  publishSignal?: number;
};

/**
 * How market price works:
 * 1. Set RWF/kg weight bands (farm-gate + butcher) for this selling week
 * 2. Set take % + visit fee + slaughter/delivery
 * 3. Save draft, then Publish — that card becomes the live public board
 */
export function PricingPanel({ publishSignal = 0 }: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<MarketRateCard | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [commissionPct, setCommissionPct] = useState("5");
  const [clevaRunCommissionPct, setClevaRunCommissionPct] = useState("2");
  const [visitFeeRwf, setVisitFeeRwf] = useState("5000");
  const [quantityTiers, setQuantityTiers] = useState<NonNullable<MarketRateCard["quantityTiers"]>>(DEFAULT_QUANTITY_TIERS);
  const [slaughter, setSlaughter] = useState("200");
  const [delivery, setDelivery] = useState("0");
  const [bands, setBands] = useState<BandRow[]>([emptyBand()]);
  const [busy, setBusy] = useState(false);
  const [showFees, setShowFees] = useState(false);
  const [showTiers, setShowTiers] = useState(false);

  const applyCard = useCallback(
    (
      card: MarketRateCard | null,
      defaults?: {
        validFrom: string;
        validTo: string;
        bands: MarketRateCard["bands"];
        quantityTiers?: MarketRateCard["quantityTiers"];
        slaughterRwfPerBird: number;
        deliveryRwfPerTrip: number;
        commissionPct: number;
        clevaRunCommissionPct?: number;
        visitFeeRwf?: number;
      }
    ) => {
      const src =
        card ||
        (defaults
          ? {
              validFrom: defaults.validFrom,
              validTo: defaults.validTo,
              slaughterRwfPerBird: defaults.slaughterRwfPerBird,
              deliveryRwfPerTrip: defaults.deliveryRwfPerTrip,
              commissionPct: defaults.commissionPct,
              clevaRunCommissionPct: defaults.clevaRunCommissionPct,
              bands: defaults.bands,
              quantityTiers: defaults.quantityTiers,
            }
          : null);
      if (!src) return;
      setValidFrom(String(src.validFrom).slice(0, 10));
      setValidTo(String(src.validTo).slice(0, 10));
      setCommissionPct(String(src.commissionPct));
      setClevaRunCommissionPct(String(src.clevaRunCommissionPct ?? defaults?.clevaRunCommissionPct ?? 2));
      setQuantityTiers(
        src.quantityTiers?.length
          ? src.quantityTiers
          : defaults?.quantityTiers?.length
            ? defaults.quantityTiers
            : DEFAULT_QUANTITY_TIERS
      );
      setSlaughter(String(src.slaughterRwfPerBird));
      setDelivery(String(src.deliveryRwfPerTrip));
      setBands(src.bands.length ? src.bands : [emptyBand()]);
    },
    []
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        const res = demoRatesPayload();
        setPublished(res.published);
        const draft = res.cards.find((c) => c.status === "draft");
        setDraftId(draft?.id ?? null);
        applyCard(draft || res.published, res.defaults);
        setVisitFeeRwf(String(res.visitFeeRwf ?? 5000));
        setApiFailed(false);
        return;
      }
      const res = await fetchMarketRates(token);
      setApiFailed(false);
      setPublished(res.published);
      const draft = res.cards.find((c) => c.status === "draft");
      setDraftId(draft?.id ?? null);
      applyCard(draft || res.published, res.defaults);
      setVisitFeeRwf(String(res.visitFeeRwf ?? res.defaults?.visitFeeRwf ?? 5000));
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load rates");
    } finally {
      setLoading(false);
    }
  }, [token, applyCard, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const livePreview = useMemo(
    () =>
      previewFromDraft({
        slaughterRwfPerBird: Number(slaughter) || 0,
        deliveryRwfPerTrip: Number(delivery) || 0,
        commissionPct: Number(commissionPct) || 0,
        bands,
      }),
    [slaughter, delivery, commissionPct, bands]
  );

  const body = {
    validFrom,
    validTo,
    commissionPct: Number(commissionPct),
    clevaRunCommissionPct: Number(clevaRunCommissionPct),
    slaughterRwfPerBird: Number(slaughter),
    deliveryRwfPerTrip: Number(delivery),
    bands,
    quantityTiers,
  };

  async function saveDraft() {
    setBusy(true);
    try {
      if (demo) {
        showToast("success", "Draft saved (demo)");
        return;
      }
      const res = await saveMarketRateDraft(token, body, draftId || undefined);
      setDraftId(res.card.id);
      const fee = Number(visitFeeRwf);
      if (fee > 0) await saveVisitFee(token, fee);
      showToast("success", "Draft saved");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      if (demo) {
        setPublished({ ...DEMO_AS_PUBLISHED(body, visitFeeRwf, draftId) });
        showToast("success", "Board published (demo) — farmers & buyers see these rates");
        return;
      }
      const saved = await saveMarketRateDraft(token, body, draftId || undefined);
      await publishMarketRate(token, saved.card.id);
      const fee = Number(visitFeeRwf);
      if (fee > 0) await saveVisitFee(token, fee);
      showToast("success", "This week’s board is live");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (publishSignal > 0) void publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- external CTA pulse
  }, [publishSignal]);

  if (loading) return <SkeletonList rows={4} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  const weekLabel =
    validFrom && validTo ? `${validFrom.slice(5)} → ${validTo.slice(5)}` : null;
  const boardStatus = published ? "Live" : draftId ? "Draft" : "Unpublished";
  const boardTone = published ? "success" : draftId ? "info" : "warning";

  return (
    <div className="space-y-stack">
      <div className="table-block overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-card py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">This week’s board</p>
            <StatusPill tone={boardTone}>{boardStatus}</StatusPill>
            {weekLabel ? (
              <span className="type-caption tabular-nums text-[var(--text-secondary)]">{weekLabel}</span>
            ) : null}
          </div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
            Save draft
          </Button>
        </div>

        {livePreview ? (
          <div className="grid gap-0 sm:grid-cols-2">
            <div className="border-b border-[var(--border-color)] px-card py-4 sm:border-b-0 sm:border-r">
              <p className="type-label text-[var(--text-secondary)]">Farmer · 200 × 1.8 kg</p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
                {formatRwf(livePreview.farmer.youReceiveRwf)}
              </p>
            </div>
            <div className="px-card py-4">
              <p className="type-label text-[var(--text-secondary)]">Butcher · 200 × 1.8 kg</p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
                {formatRwf(livePreview.butcher.youPayRwf)}
              </p>
            </div>
          </div>
        ) : (
          <p className="px-card py-4 type-caption text-[var(--text-muted)]">Add a 1.8 kg band to preview receipts.</p>
        )}
      </div>

      <div className="table-block space-y-4 p-card">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Weight bands</p>
        {bands.map((b, i) => (
          <div
            key={`${b.minKg}-${i}`}
            className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-5"
          >
            <Field label="Min kg">
              <Input
                type="number"
                step="0.1"
                value={b.minKg}
                onChange={(e) =>
                  setBands((rows) => rows.map((row, idx) => (idx === i ? { ...row, minKg: Number(e.target.value) } : row)))
                }
              />
            </Field>
            <Field label="Max kg">
              <Input
                type="number"
                step="0.1"
                value={b.maxKg}
                onChange={(e) =>
                  setBands((rows) => rows.map((row, idx) => (idx === i ? { ...row, maxKg: Number(e.target.value) } : row)))
                }
              />
            </Field>
            <Field label="Farm-gate / kg">
              <Input
                type="number"
                value={b.farmGateRwfPerKg}
                onChange={(e) =>
                  setBands((rows) =>
                    rows.map((row, idx) => (idx === i ? { ...row, farmGateRwfPerKg: Number(e.target.value) } : row))
                  )
                }
              />
            </Field>
            <Field label="Butcher / kg">
              <Input
                type="number"
                value={b.butcherRwfPerKg}
                onChange={(e) =>
                  setBands((rows) =>
                    rows.map((row, idx) => (idx === i ? { ...row, butcherRwfPerKg: Number(e.target.value) } : row))
                  )
                }
              />
            </Field>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={bands.length <= 1}
                onClick={() => setBands((rows) => rows.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setBands((rows) => [...rows, emptyBand()])}>
          Add band
        </Button>
      </div>

      <div className="table-block p-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setShowFees((v) => !v)}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Week & fees</p>
            {!showFees ? (
              <span className="type-caption tabular-nums text-[var(--text-primary)]">
                {weekLabel} · visit {formatRwf(Number(visitFeeRwf) || 0)} · {commissionPct}%
              </span>
            ) : null}
          </div>
          <span className="shrink-0 text-xs font-semibold text-[var(--text-primary)]">{showFees ? "Hide" : "Edit"}</span>
        </button>
        {showFees ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Valid from">
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </Field>
            <Field label="Valid to">
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </Field>
            <Field label="Market-only take %">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
              />
            </Field>
            <Field label="Cleva-run take %">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={clevaRunCommissionPct}
                onChange={(e) => setClevaRunCommissionPct(e.target.value)}
              />
            </Field>
            <Field label="Scout visit fee (RWF)">
              <Input type="number" min={0} value={visitFeeRwf} onChange={(e) => setVisitFeeRwf(e.target.value)} />
            </Field>
            <Field label="Slaughter RWF / bird">
              <Input type="number" min={0} value={slaughter} onChange={(e) => setSlaughter(e.target.value)} />
            </Field>
            <Field label="Delivery RWF / trip">
              <Input type="number" min={0} value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="table-block p-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setShowTiers((v) => !v)}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)]">Volume tiers</p>
          <span className="shrink-0 text-xs font-semibold text-[var(--text-primary)]">{showTiers ? "Hide" : "Edit"}</span>
        </button>
        {showTiers ? (
          <div className="mt-3 space-y-2">
            {quantityTiers.map((tier, i) => (
              <div key={tier.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Field label="Label">
                  <Input
                    value={tier.label}
                    onChange={(e) =>
                      setQuantityTiers((rows) =>
                        rows.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row))
                      )
                    }
                  />
                </Field>
                <Field label="Min birds">
                  <Input
                    type="number"
                    value={tier.minBirds}
                    onChange={(e) =>
                      setQuantityTiers((rows) =>
                        rows.map((row, idx) => (idx === i ? { ...row, minBirds: Number(e.target.value) } : row))
                      )
                    }
                  />
                </Field>
                <Field label="Max birds">
                  <Input
                    type="number"
                    value={tier.maxBirds ?? ""}
                    onChange={(e) =>
                      setQuantityTiers((rows) =>
                        rows.map((row, idx) =>
                          idx === i ? { ...row, maxBirds: e.target.value === "" ? null : Number(e.target.value) } : row
                        )
                      )
                    }
                  />
                </Field>
                <Field label="Farm adj">
                  <Input
                    type="number"
                    value={tier.farmGateAdjRwf}
                    onChange={(e) =>
                      setQuantityTiers((rows) =>
                        rows.map((row, idx) => (idx === i ? { ...row, farmGateAdjRwf: Number(e.target.value) } : row))
                      )
                    }
                  />
                </Field>
                <Field label="Buyer adj">
                  <Input
                    type="number"
                    value={tier.butcherAdjRwf}
                    onChange={(e) =>
                      setQuantityTiers((rows) =>
                        rows.map((row, idx) => (idx === i ? { ...row, butcherAdjRwf: Number(e.target.value) } : row))
                      )
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DEMO_AS_PUBLISHED(
  body: {
    validFrom: string;
    validTo: string;
    commissionPct: number;
    clevaRunCommissionPct: number;
    slaughterRwfPerBird: number;
    deliveryRwfPerTrip: number;
    bands: BandRow[];
    quantityTiers: TierRow[];
  },
  _visitFee: string,
  draftId: string | null
): MarketRateCard {
  return {
    id: draftId || "demo_published",
    status: "published",
    validFrom: body.validFrom,
    validTo: body.validTo,
    commissionPct: body.commissionPct,
    clevaRunCommissionPct: body.clevaRunCommissionPct,
    slaughterRwfPerBird: body.slaughterRwfPerBird,
    deliveryRwfPerTrip: body.deliveryRwfPerTrip,
    bands: body.bands,
    quantityTiers: body.quantityTiers,
  };
}
