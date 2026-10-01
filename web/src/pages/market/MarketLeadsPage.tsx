import { useCallback, useEffect, useState } from "react";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import { PageTabs } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { EmptyState } from "../../components/EmptyState";
import {
  convertMarketLead,
  fetchMarketLeads,
  patchMarketLead,
  type MarketLead,
} from "../../api/pipeline.api";
import { formatRwf } from "../../lib/marketQuote";

type Side = "buy" | "sell";
type Tab = "new" | "contacted" | "converted" | "spam";

function ageLabel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function isSell(lead: MarketLead) {
  return lead.source === "public_sell" || lead.buyerType === "farmer";
}

const SETTLE_LABEL: Record<string, string> = {
  cash_scale: "Cash at the scale",
  same_week: "Same week",
  days_7: "7 days",
  days_14: "14 days",
};

function neededLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const d = String(iso).slice(0, 10);
  return d || null;
}

function convertToast(lead: MarketLead, res: Awaited<ReturnType<typeof convertMarketLead>>) {
  if (res.alreadyConverted) return "Already converted";
  if (res.lotId || isSell(lead)) {
    return res.publicRef ? `Scout lot ${res.publicRef}` : "Scout lot created — pending review";
  }
  return res.buyerId ? `Converted → buyer ${res.buyerId.slice(0, 8)}…` : "Converted";
}

export function MarketLeadsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [side, setSide] = useState<Side>("buy");
  const [tab, setTab] = useState<Tab>("new");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<MarketLead[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMarketLeads(token, tab, side);
      setLeads(res.leads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }, [allowed, token, tab, side]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await patchMarketLead(token, id, { status });
      showToast("success", `Marked ${status}`);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function convert(lead: MarketLead) {
    setBusy(lead.id);
    try {
      const res = await convertMarketLead(token, lead.id);
      showToast("success", convertToast(lead, res));
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Convert failed");
    } finally {
      setBusy(null);
    }
  }

  if (!allowed) {
    return (
      <EmptyState title="Desk only" description="Sales coordinators and superusers triage leads." />
    );
  }

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead
        title="Leads"
        action={
          <button type="button" className="store-btn store-btn-ghost" onClick={() => void reload()}>
            Refresh
          </button>
        }
      />
      <p className="text-sm text-[var(--store-muted)]">
        {side === "sell"
          ? "Farmers who left name, phone, and a count on /sell. Call, then create a scout lot."
          : "Butcher requests from the public market. Call, convert to buyer + demand, or mark spam."}
      </p>

      <PageTabs
        value={side}
        onChange={(v) => setSide(v as Side)}
        options={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
      />

      <PageTabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "new", label: "New" },
          { value: "contacted", label: "Contacted" },
          { value: "converted", label: "Converted" },
          { value: "spam", label: "Spam" },
        ]}
      />

      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {!loading && !error && leads.length === 0 ? (
        <EmptyState
          title="No leads here"
          description={side === "sell" ? "Seller leads from /sell show under New." : "New public requests will show under New."}
        />
      ) : null}

      <ul className="space-y-3">
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{lead.contactName}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {lead.businessName ? `${lead.businessName} · ` : ""}
                  {lead.district || "—"} · {lead.birds != null ? `${lead.birds} this trip` : "birds TBD"}
                  {lead.typicalBirdsPerWeek != null ? ` · usual ${lead.typicalBirdsPerWeek}/wk` : ""}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {neededLabel(lead.neededFrom) ? `When ${neededLabel(lead.neededFrom)}` : "When TBD"}
                  {lead.settleTerms ? ` · ${SETTLE_LABEL[lead.settleTerms] || lead.settleTerms}` : ""}
                  {lead.expectedRwfPerKg != null
                    ? ` · expect ${formatRwf(lead.expectedRwfPerKg)}/kg`
                    : " · board"}
                  {lead.handover ? ` · ${lead.handover}` : ""}
                  {lead.process ? ` · ${lead.process}` : ""}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                  {isSell(lead) ? "Sell" : "Buy"} · {lead.lotPublicRef || "No lot"} · {ageLabel(lead.createdAt)} ago
                </p>
                {lead.quoteJson?.farmer ? (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Offer {formatRwf(lead.quoteJson.farmer.youReceiveRwf)}
                    {lead.avgWeightKg != null ? ` · ${Number(lead.avgWeightKg).toFixed(1)} kg` : ""}
                    {lead.quoteJson.farmer.farmGateRwfPerKg
                      ? ` · farm-gate ${formatRwf(lead.quoteJson.farmer.farmGateRwfPerKg)}/kg`
                      : ""}
                  </p>
                ) : null}
                {lead.message ? (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{lead.message}</p>
                ) : null}
              </div>
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex min-h-control-sm items-center rounded-control bg-[var(--primary-color)] px-3 text-xs font-semibold text-white"
              >
                Call {lead.phone}
              </a>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tab === "new" ? (
                <button
                  type="button"
                  className="store-btn store-btn-ghost"
                  disabled={busy === lead.id}
                  onClick={() => void setStatus(lead.id, "contacted")}
                >
                  Mark contacted
                </button>
              ) : null}
              {tab !== "converted" && tab !== "spam" ? (
                <button
                  type="button"
                  className="store-btn store-btn-ember"
                  disabled={busy === lead.id}
                  onClick={() => void convert(lead)}
                >
                  {isSell(lead) ? "Create scout lot" : "Convert"}
                </button>
              ) : null}
              {tab !== "spam" ? (
                <button
                  type="button"
                  className="store-btn store-btn-ghost"
                  disabled={busy === lead.id}
                  onClick={() => void setStatus(lead.id, "spam")}
                >
                  Spam
                </button>
              ) : null}
              {tab === "spam" ? (
                <button
                  type="button"
                  className="store-btn store-btn-ghost"
                  disabled={busy === lead.id}
                  onClick={() => void setStatus(lead.id, "new")}
                >
                  Restore
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
