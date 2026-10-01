import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button, NoticeStrip, PageTabs } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { fetchMarketOpsSummary } from "../../api/pipeline.api";
import { TodayPanel } from "./ops/TodayPanel";
import { BookPanel } from "./ops/BookPanel";
import { BuyersPanel } from "./ops/BuyersPanel";
import { PricingPanel } from "./ops/PricingPanel";
import { ScoutsPanel } from "./ops/ScoutsPanel";
import { forceMarketDemoFromUrl, isMarketDemoEligibleError } from "./ops/demoMarketData";

export type MarketOpsTab = "today" | "book" | "buyers" | "pricing" | "scouts";

const TABS: { value: MarketOpsTab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "book", label: "Book" },
  { value: "buyers", label: "Buyers" },
  { value: "pricing", label: "Pricing" },
  { value: "scouts", label: "Scouts" },
];

function parseTab(raw: string | null): MarketOpsTab {
  if (raw === "book" || raw === "buyers" || raw === "pricing" || raw === "scouts" || raw === "today") return raw;
  return "today";
}

export function MarketOpsPage() {
  const { user, token } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const allowed = canAccessPipelineDesk(user);
  const tab = parseTab(params.get("tab"));
  const panel = params.get("panel") ?? "";
  const queue = params.get("queue") ?? "";
  const demo = forceMarketDemoFromUrl(params.toString());
  const [publishSignal, setPublishSignal] = useState(0);

  // Auto-enable demo fixtures when Postgres isn’t available (local DEV walkthrough).
  useEffect(() => {
    if (!allowed || !token || demo || !import.meta.env.DEV) return;
    let cancelled = false;
    void (async () => {
      try {
        await fetchMarketOpsSummary(token);
      } catch (e) {
        if (cancelled || !isMarketDemoEligibleError(e)) return;
        setParams(
          (prev) => {
            const n = new URLSearchParams(prev);
            n.set("demo", "1");
            return n;
          },
          { replace: true }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, token, demo, setParams]);

  const setTab = (next: MarketOpsTab) => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next === "today") n.delete("tab");
        else n.set("tab", next);
        n.delete("panel");
        n.delete("queue");
        return n;
      },
      { replace: true }
    );
  };

  const setPanel = (next: string) => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (!next || next === "accounts" || next === "weigh") n.delete("panel");
        else n.set("panel", next);
        return n;
      },
      { replace: true }
    );
  };

  const primary = useMemo(() => {
    if (tab === "book") {
      return {
        label: "Scout lot",
        onClick: () => navigate(companyHref("/farm/pipeline/scout?mode=offplatform")),
      };
    }
    if (tab === "buyers") {
      return { label: "Add buyer", onClick: () => setPanel("accounts-new") };
    }
    if (tab === "pricing") {
      return { label: "Publish board", onClick: () => setPublishSignal((n) => n + 1) };
    }
    if (tab === "scouts") {
      return {
        label: "Log visit",
        onClick: () => navigate(companyHref("/farm/pipeline/scout")),
      };
    }
    return null;
  }, [tab, navigate, companyHref]);

  if (!allowed) {
    return (
      <ManagerPage>
        <PageHeader title="Market" />
        <p className="text-sm text-[var(--text-muted)]">Sales coordinator or superuser access required.</p>
      </ManagerPage>
    );
  }

  return (
    <ManagerPage>
      <PageHeader
        title="Market"
        tabs={
          <PageTabs
            aria-label="Market areas"
            value={tab}
            onChange={(v) => setTab(parseTab(v))}
            options={TABS}
          />
        }
        action={
          primary ? (
            <Button size="sm" variant="primary" onClick={primary.onClick}>
              {primary.label}
            </Button>
          ) : null
        }
      />

      {demo ? (
        <NoticeStrip tone="info" className="mb-stack">
          Demo mode — sample data until Postgres is connected.
        </NoticeStrip>
      ) : null}

      {tab === "today" ? (
        <TodayPanel
          queue={queue}
          onOpenTab={(t, opts) => {
            setParams(
              (prev) => {
                const n = new URLSearchParams(prev);
                if (t === "today") n.delete("tab");
                else n.set("tab", t);
                if (opts?.panel) n.set("panel", opts.panel);
                else n.delete("panel");
                if (opts?.queue) n.set("queue", opts.queue);
                else n.delete("queue");
                return n;
              },
              { replace: true }
            );
          }}
        />
      ) : null}
      {tab === "book" ? <BookPanel /> : null}
      {tab === "buyers" ? (
        <BuyersPanel
          panel={panel === "accounts-new" ? "accounts" : panel || "accounts"}
          openCreate={panel === "accounts-new"}
          onPanelChange={setPanel}
        />
      ) : null}
      {tab === "pricing" ? <PricingPanel publishSignal={publishSignal} /> : null}
      {tab === "scouts" ? (
        <ScoutsPanel panel={panel || "weigh"} onPanelChange={setPanel} />
      ) : null}
    </ManagerPage>
  );
}
