import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext";
import { useCompanyNav } from "../../../hooks/useCompanyNav";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import { Button } from "../../../components/ui";
import {
  fetchMarketRates,
  fetchOpsCommissions,
  fetchPipelineLots,
  fetchVerifyQueue,
  markCommissionPaid,
  verifyLot,
  type PipelineLot,
} from "../../../api/pipeline.api";
import { BookPanel } from "./BookPanel";
import { PricingPanel } from "./PricingPanel";
import { ScoutsPanel } from "./ScoutsPanel";
import { FLOCK_STEPS, FLOCK_STEP_LABEL, flockStep, type FlockStep } from "./deskWork";

export type DeskTool = "price" | "match" | "pay";

type Props = {
  tool: DeskTool | null;
  onTool: (tool: DeskTool | null) => void;
};


type PayRow = {
  id: string;
  title: string;
  detail: string;
  kind: "visit" | "trade";
};

function StepTrail({ current }: { current: FlockStep }) {
  return (
    <p className="mt-1 text-xs text-[var(--text-muted)]">
      {FLOCK_STEPS.map((step, index) => (
        <span key={step}>
          {index > 0 ? " · " : ""}
          <span className={step === current ? "font-semibold text-[var(--text-primary)]" : undefined}>
            {FLOCK_STEP_LABEL[step]}
          </span>
        </span>
      ))}
    </p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

export function NeedsYou({ tool, onTool }: Props) {
  const { token } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flocks, setFlocks] = useState<Array<{ lot: PipelineLot; step: FlockStep }>>([]);
  const [live, setLive] = useState<PipelineLot[]>([]);
  const [pay, setPay] = useState<PayRow[]>([]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [verify, lotsRes, rates, commissions] = await Promise.all([
        fetchVerifyQueue(token),
        fetchPipelineLots(token),
        fetchMarketRates(token).then(
          (res) => ({ ok: true as const, published: Boolean(res.published) }),
          () => ({ ok: false as const, published: true })
        ),
        fetchOpsCommissions(token, "accrued").catch(() => ({ commissions: [] })),
      ]);

      const verifyLotIds = new Set((verify.lots ?? []).map((lot) => lot.id));
      const pricePublished = rates.published;
      const nextFlocks = (lotsRes.lots ?? [])
        .map((lot) => ({ lot, step: flockStep(lot, { verifyIds: verifyLotIds, pricePublished }) }))
        .filter((row): row is { lot: PipelineLot; step: FlockStep } => row.step != null)
        .sort((a, b) => FLOCK_STEPS.indexOf(a.step) - FLOCK_STEPS.indexOf(b.step));

      setFlocks(nextFlocks);
      setLive(
        (lotsRes.lots ?? []).filter(
          (lot) =>
            lot.listingPhase === "live" &&
            (lot.remainingBirds ?? lot.birdCount) > 0 &&
            (lot.status === "open" || lot.status === "partial")
        )
      );
      setPay(
        commissions.commissions.map((row) => ({
          id: row.id,
          title: row.lotFarmLabel || row.buyerName || "Scout pay",
          detail: [row.scoutName, row.kind === "visit" ? "Visit" : "Sale"].filter(Boolean).join(" · "),
          kind: row.kind === "visit" ? "visit" : "trade",
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the desk");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!tool) return;
    document.getElementById(`desk-${tool}`)?.scrollIntoView({ block: "start" });
  }, [tool]);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      showToast("success", ok);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not do that");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <SkeletonList rows={4} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  const nothing = flocks.length === 0 && live.length === 0 && pay.length === 0 && !tool;

  return (
    <div className="space-y-8">
      <p className="text-sm text-[var(--text-secondary)]">
        People are handled in{" "}
        <Link to={companyHref("/farm/pipeline/people")} className="font-semibold text-[var(--primary-color)]">
          People
        </Link>
        . This list is the flock work that is still waiting.
      </p>

      {nothing ? <p className="text-sm text-[var(--text-muted)]">Nothing is waiting.</p> : null}

      {flocks.length > 0 ? (
        <Section title="Flocks">
          <ul className="space-y-2">
            {flocks.map(({ lot, step }) => (
              <li
                key={lot.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {lot.farmLabel || lot.district || "Flock"} · {lot.remainingBirds ?? lot.birdCount} birds
                  </p>
                  <StepTrail current={step} />
                </div>
                {step === "approve" ? (
                  <Button
                    size="sm"
                    disabled={busyId === lot.id}
                    onClick={() => void run(lot.id, () => verifyLot(token, lot.id, "verified"), "Approved")}
                  >
                    Approve
                  </Button>
                ) : null}
                {step === "price" ? (
                  <Button size="sm" onClick={() => onTool("price")}>
                    Set price
                  </Button>
                ) : null}
                {step === "visit" ? (
                  <Button size="sm" onClick={() => navigate(companyHref(`/farm/pipeline/weigh/${lot.id}`))}>
                    Visit
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {live.length > 0 ? (
        <Section title="On the market">
          <ul className="space-y-2">
            {live.map((lot) => (
              <li
                key={lot.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {lot.farmLabel || lot.district || "Flock"} · {lot.remainingBirds ?? lot.birdCount} birds
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Posted. Match a buyer.</p>
                </div>
                <Button size="sm" onClick={() => onTool("match")}>
                  Match
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {pay.length > 0 ? (
        <Section title="Pay scouts">
          <ul className="space-y-2">
            {pay.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)]">{row.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{row.detail}</p>
                </div>
                <Button
                  size="sm"
                  disabled={busyId === row.id}
                  onClick={() => void run(row.id, () => markCommissionPaid(token, row.id, undefined, row.kind), "Marked paid")}
                >
                  Pay
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {tool === "price" ? (
        <section id="desk-price" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Price board</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onTool(null);
                void reload();
              }}
            >
              Close
            </Button>
          </div>
          <PricingPanel />
        </section>
      ) : null}
      {tool === "match" ? (
        <section id="desk-match" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Match a buyer</h2>
            <Button size="sm" variant="ghost" onClick={() => onTool(null)}>
              Close
            </Button>
          </div>
          <BookPanel />
        </section>
      ) : null}
      {tool === "pay" ? (
        <section id="desk-pay" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Pay scouts</h2>
            <Button size="sm" variant="ghost" onClick={() => onTool(null)}>
              Close
            </Button>
          </div>
          <ScoutsPanel panel="pay" onPanelChange={() => undefined} />
        </section>
      ) : null}
    </div>
  );
}
