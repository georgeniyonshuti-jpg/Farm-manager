import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import { Field, Input } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import {
  fetchMarketRates,
  publishMarketRate,
  saveMarketRateDraft,
  saveVisitFee,
  type MarketRateCard,
} from "../../api/pipeline.api";
import { formatRwf, previewFromDraft } from "../../lib/marketQuote";

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

export function MarketRatesPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<MarketRateCard[]>([]);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof fetchMarketRates>>["preview"]>(null);
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

  const applyCard = useCallback((card: MarketRateCard | null, defaults?: Awaited<ReturnType<typeof fetchMarketRates>>["defaults"]) => {
    const src = card || (defaults
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
  }, []);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMarketRates(token);
      setCards(res.cards);
      setPreview(res.preview);
      const draft = res.cards.find((c) => c.status === "draft");
      setDraftId(draft?.id ?? null);
      applyCard(draft || res.published, res.defaults);
      setVisitFeeRwf(String(res.visitFeeRwf ?? res.defaults?.visitFeeRwf ?? 5000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load rates");
    } finally {
      setLoading(false);
    }
  }, [allowed, token, applyCard]);

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
      }) ||
      (preview ? { farmer: preview.farmer.farmer, butcher: preview.butcher } : null),
    [slaughter, delivery, commissionPct, bands, preview]
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
      const saved = await saveMarketRateDraft(token, body, draftId || undefined);
      await publishMarketRate(token, saved.card.id);
      showToast("success", "This week’s board is live");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return <EmptyState title="Desk only" description="Sales coordinators publish this week’s broiler board." />;
  }

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead
        title="This week’s board"
        action={
          <button type="button" className="store-btn store-btn-ghost" onClick={() => void reload()}>
            Refresh
          </button>
        }
      />
      <p className="text-sm text-[var(--store-muted)]">
        Name this week’s farm-gate and butcher prices. Farmers see you-receive. Butchers see the board. Final at the
        scale.
      </p>

      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {livePreview ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Farmer · 200 × 1.8 kg</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatRwf(livePreview.farmer.youReceiveRwf)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Meat {formatRwf(livePreview.farmer.meatRwf)} · commission −
              {formatRwf(livePreview.farmer.commissionRwf)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Butcher · 200 × 1.8 kg</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatRwf(livePreview.butcher.youPayRwf)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Meat {formatRwf(livePreview.butcher.meatRwf)} · slaughter {formatRwf(livePreview.butcher.slaughterRwf)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Add a matching 1.8 kg band to preview both receipts.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valid from">
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Valid to">
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </Field>
        <Field label="Market-only take %">
          <Input type="number" min={0} max={100} step="0.1" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
        </Field>
        <Field label="Cleva-run take %">
          <Input type="number" min={0} max={100} step="0.1" value={clevaRunCommissionPct} onChange={(e) => setClevaRunCommissionPct(e.target.value)} />
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

      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Weight bands</p>
        {bands.map((b, i) => (
          <div key={`${b.minKg}-${i}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          </div>
        ))}
        <button type="button" className="store-btn store-btn-ghost" onClick={() => setBands((rows) => [...rows, emptyBand()])}>
          Add band
        </button>
      </div>

      <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Volume tiers</p>
          {quantityTiers.map((tier, i) => (
            <div key={tier.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Field label="Label">
                <Input
                  value={tier.label}
                  onChange={(e) =>
                    setQuantityTiers((rows) => rows.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row)))
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
                      rows.map((row, idx) => (idx === i ? { ...row, maxBirds: e.target.value === "" ? null : Number(e.target.value) } : row))
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

      <div className="flex flex-wrap gap-2">
        <button type="button" className="store-btn store-btn-ghost" disabled={busy} onClick={() => void saveDraft()}>
          Save draft
        </button>
        <button type="button" className="store-btn store-btn-ember" disabled={busy} onClick={() => void publish()}>
          Publish this week
        </button>
      </div>

      {cards.length ? (
        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
          {cards.map((c) => (
            <li key={c.id}>
              {c.status} · {String(c.validFrom).slice(0, 10)}–{String(c.validTo).slice(0, 10)} · {c.commissionPct}%
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
