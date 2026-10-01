import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { stripTenantPrefix } from "../../lib/tenancy";
import { FieldLogSheet } from "../../components/field/FieldLogSheet";
import { CountStepper } from "../../components/field/CountStepper";
import { KgStepper } from "../../components/field/KgStepper";
import { FieldMissionCard } from "../../components/field/FieldMissionCard";
import { FieldNavHeader } from "../../components/layout/FieldPageHeader";
import { Button, SegmentedControl, StatusPill } from "../../components/ui";
import { MarketPhotoField } from "../../components/market/MarketPhotoField";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { EmptyState } from "../../components/EmptyState";
import {
  fetchWeighQueue,
  submitLotWeigh,
  type MarketMedia,
  type WeighQueueLot,
} from "../../api/pipeline.api";
import { sellingWeekLabel, visitBeforeLabel } from "../../lib/sellingWeek";
import { formatRwf } from "../../lib/formatRwf";

type Outcome = "ready" | "slip_week" | "problem";

export function PipelineWeighPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const allowed = canScoutPipeline(user);
  const weighMatch = stripTenantPrefix(pathname).match(/^\/farm\/pipeline\/weigh\/([^/]+)/);
  const selectedId = weighMatch?.[1] || params.get("lotId") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lots, setLots] = useState<WeighQueueLot[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const [visitFeeRwf, setVisitFeeRwf] = useState(5000);
  const [lot, setLot] = useState<WeighQueueLot | null>(null);
  const [birds, setBirds] = useState(100);
  const [avgKg, setAvgKg] = useState(1.6);
  const [outcome, setOutcome] = useState<Outcome>("ready");
  const [media, setMedia] = useState<MarketMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWeighQueue(token, Boolean(user && (user.role === "superuser" || user.role === "sales_coordinator")));
      setLots(res.lots);
      setDueThisWeek(res.dueThisWeek);
      setVisitFeeRwf(res.visitFeeRwf);
      const found = res.lots.find((l) => l.id === selectedId) || null;
      setLot(found);
      if (found) {
        setBirds(found.remainingBirds ?? found.birdCount ?? 100);
        if (found.avgWeightKg) setAvgKg(Number(found.avgWeightKg));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load weigh visits");
    } finally {
      setLoading(false);
    }
  }, [allowed, token, selectedId, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submit() {
    if (!lot) return;
    setBusy(true);
    try {
      const res = await submitLotWeigh(token, lot.id, {
        birds,
        avgWeightKg: avgKg,
        outcome,
        readyFrom: lot.readyFrom,
        readyTo: lot.readyTo,
      });
      setReview(`Visit logged · ${formatRwf(res.visitFeeRwf || 0)} pending.`);
      showToast("success", "Visit logged");
      setTimeout(() => navigate(companyHref("/farm/pipeline/weigh")), 800);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not log visit");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-3 pb-8">
        <FieldNavHeader title="Weigh visits" variant="hub" showAccount />
        <p className="text-sm text-[var(--text-secondary)]">Scout only.</p>
      </div>
    );
  }

  if (selectedId && lot) {
    return (
      <FieldLogSheet
        title="Weigh visit"
        backLabel="Queue"
        onBack={() => navigate(companyHref("/farm/pipeline/weigh"))}
        submitLabel="Log visit"
        submittingLabel="Saving…"
        busy={busy}
        submitDisabled={outcome === "ready" && (!(birds > 0) || !(avgKg > 0))}
        onSubmit={() => void submit()}
      >
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {lot.district || "Farm"} · {lot.birdCount} birds
        </p>
        <p className="type-caption text-[var(--text-muted)]">
          {lot.sellingWeekLabel || sellingWeekLabel(lot.readyFrom, lot.readyTo)}
        </p>
        <CountStepper label="Live count" value={birds} onChange={setBirds} step={5} min={1} />
        <KgStepper label="Average kg" value={avgKg} onChange={setAvgKg} step={0.1} min={0.1} />
        <SegmentedControl
          label="Outcome"
          variant="grid"
          value={outcome}
          options={[
            { value: "ready", label: "Ready" },
            { value: "slip_week", label: "Slip week" },
            { value: "problem", label: "Problem" },
          ]}
          onChange={(v) => setOutcome(v as Outcome)}
        />
        <MarketPhotoField token={token} ownerType="lot" ownerId={lot.id} media={media} onChange={setMedia} />
        {review ? <p className="text-sm font-semibold text-[var(--text-primary)]">{review}</p> : null}
      </FieldLogSheet>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <FieldNavHeader title="Weigh visits" variant="hub" showAccount />
      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <FieldMissionCard
            statusTitle={`${dueThisWeek} weigh visits this week`}
            statusSubtitle={`${lots.length} on the book · ${formatRwf(visitFeeRwf)} visit`}
            urgencyTone={dueThisWeek > 0 ? "warning" : "neutral"}
            urgencyLabel={dueThisWeek > 0 ? "Due" : "Clear"}
            primaryAction={
              lots[0] ? (
                <Button
                  type="button"
                  size="field"
                  className="w-full"
                  onClick={() => navigate(companyHref(`/farm/pipeline/weigh/${lots[0].id}`))}
                >
                  Open next visit
                </Button>
              ) : (
                <span className="text-sm text-[var(--text-muted)]">No visits due</span>
              )
            }
          />
          {lots.length === 0 ? (
            <EmptyState title="No weigh visits due" />
          ) : (
            <ul className="space-y-2">
              {lots.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 text-left"
                    onClick={() => navigate(companyHref(`/farm/pipeline/weigh/${row.id}`))}
                  >
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {row.district || "Farm"} · {row.birdCount} birds
                      </p>
                      <p className="type-caption text-[var(--text-muted)]">
                        {row.sellingWeekLabel || sellingWeekLabel(row.readyFrom, row.readyTo)}
                      </p>
                      <p className="type-caption text-[var(--text-secondary)]">{visitBeforeLabel(row.readyFrom)}</p>
                    </div>
                    <StatusPill tone={row.listingPhase === "visit_due" ? "warning" : "neutral"}>
                      {row.listingPhase === "visit_due" ? "Due" : "Booked"}
                    </StatusPill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
