/**
 * Recruitment command centre. One snapshot, five views.
 * The previous page stays at /dashboard/market/recruitment-legacy.
 */

import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../components/PageHeader";
import { PageTabs, TextLink } from "../../../components/ui";
import { useAuth } from "../../../auth/AuthContext";
import { canWorkRecruitment } from "../../../auth/permissions";
import { useCompanyNav } from "../../../hooks/useCompanyNav";
import {
  fetchBriefing,
  fetchBriefingWeeks,
  fetchDefinitions,
  fetchRecruitmentPeople,
  fetchRecruitmentSnapshot,
  postRecruitment,
  type CommandSnapshot,
  type PersonRow,
  type WeeklyNotes,
} from "./api";
import { DEMO_DEFS, DEMO_PEOPLE, demoSnapshot } from "./demo";
import { formatAsOf, rangeFor } from "./format";
import { Drawer, FilterBar, RecSkeleton, SourceChip, StaleBanner } from "./ui";
import { OverviewView, PeopleList, PipelineView, ScoutsView, SourcesView, WeeklyView } from "./views";

const VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "pipeline", label: "Pipeline" },
  { value: "sources", label: "Sources" },
];

const OFFICER_VIEWS = VIEWS.filter((item) => item.value !== "sources");

export function RecruitmentAnalyticsPage({ standalone = false }: { standalone?: boolean }) {
  const { user, token } = useAuth();
  const { companyHref } = useCompanyNav();
  const [params, setParams] = useSearchParams();
  const preview = standalone || import.meta.env.DEV ? params.get("state") : null;
  const officer = user?.role === "sales_officer";
  const demoKind = preview === "stale" || preview === "unavailable" ? preview : preview === "demo" || (standalone && !preview) ? "demo" : null;
  const requested = params.get("view") || "overview";
  const view = officer
    ? requested === "pipeline"
      ? "pipeline"
      : "overview"
    : requested === "scouts" || requested === "weekly"
      ? "overview"
      : requested;
  const range = params.get("range") || "7";
  const channel = params.get("channel") || "";
  const district = params.get("district") || "";

  const [snap, setSnap] = useState<CommandSnapshot | null>(demoKind ? demoSnapshot(demoKind) : null);
  const [loading, setLoading] = useState(!demoKind && preview !== "error" && preview !== "empty");
  const [error, setError] = useState<string | null>(preview === "error" ? "Could not load recruitment." : null);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [listTitle, setListTitle] = useState("People");
  const [scoutId, setScoutId] = useState<string | null>(null);
  const [defsOpen, setDefsOpen] = useState(false);
  const [defs, setDefs] = useState<{ id: string; label: string; definition: string; formula?: string }[]>(DEMO_DEFS);
  const [defSql, setDefSql] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<{ week: string }[]>(demoKind ? [{ week: "2026-10-12" }] : []);
  const [frozen, setFrozen] = useState<CommandSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demoKind || preview === "loading" || preview === "error" || preview === "empty") return;
    if (!token) return;
    setLoading(true);
    setError(null);
    const dates = rangeFor(range);
    try {
      const next = await fetchRecruitmentSnapshot(token, {
        ...dates,
        channels: channel || undefined,
        districts: district || undefined,
        view: "all",
      });
      setSnap(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load recruitment.");
    } finally {
      setLoading(false);
    }
  }, [token, range, channel, district, demoKind, preview]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (demoKind || !token || view !== "overview" || officer) return;
    void fetchBriefingWeeks(token).then((data) => setWeeks(data.weeks)).catch(() => setWeeks([]));
  }, [token, view, demoKind, officer]);

  if (!standalone && !canWorkRecruitment(user)) return <Navigate to="/" replace />;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  async function openList(metric: string, extra: Record<string, string> = {}) {
    setListTitle("People");
    if (demoKind) {
      setPeople(DEMO_PEOPLE);
      return;
    }
    if (!token) return;
    const dates = rangeFor(range);
    const query: Record<string, string> = { ...dates, metric, ...extra };
    if (channel) query.channels = channel;
    if (district) query.districts = district;
    const list = await fetchRecruitmentPeople(token, query);
    setPeople(list.people);
  }

  async function openDefs() {
    setDefsOpen(true);
    if (demoKind || !token) {
      setDefs(DEMO_DEFS);
      return;
    }
    const data = await fetchDefinitions(token);
    setDefs(data.definitions);
    setDefSql(data.sql);
  }

  const showRange = view === "pipeline" || view === "sources";
  const showSnap = Boolean(snap) && preview !== "loading" && preview !== "error" && preview !== "empty" && !loading && !error;
  const scout = scoutId ? snap?.scouts?.rows.find((row) => row.personId === scoutId) : null;

  const viewTabs = (
    <PageTabs
      value={view}
      options={officer ? OFFICER_VIEWS : VIEWS}
      onChange={(value) => setParam("view", value)}
      aria-label="Recruitment views"
    />
  );

  return (
    <PageHeader
      title="Recruitment"
      tabs={standalone ? undefined : viewTabs}
      action={
        standalone || officer ? undefined : (
          <TextLink href={companyHref("/dashboard/market/recruitment-legacy")}>Previous version</TextLink>
        )
      }
    >
      <div className="rec-page">
        {standalone ? <h1 className="rec-title">Recruitment</h1> : null}
        {demoKind ? <p className="rec-pill rec-pill-demo" role="status">Demo data</p> : null}
        {standalone ? <div className="rec-toolbar">{viewTabs}</div> : null}
        <FilterBar
          showRange={showRange}
          range={range}
          onRange={(value) => setParam("range", value)}
          channel={channel}
          channels={snap?.meta.channelCatalog || snap?.command.channelCatalog || []}
          onChannel={(value) => setParam("channel", value)}
          district={district}
          districts={snap?.meta.districts || []}
          onDistrict={(value) => setParam("district", value)}
          asOf={formatAsOf(snap?.meta.generatedAt)}
          onRefresh={() => void load()}
        />
        {snap?.stale ? <StaleBanner asOf={formatAsOf(snap.meta.generatedAt)} reason={snap.staleReason} /> : null}
        {preview === "loading" || loading ? <RecSkeleton /> : null}
        {preview === "error" || error ? (
          <div className="rec-stack">
            <p className="rec-empty" role="alert">{error || "Could not load recruitment."}</p>
            <TextLink onClick={() => void load()}>Retry</TextLink>
          </div>
        ) : null}
        {preview === "empty" ? (
          <div className="rec-stack">
            <p className="rec-empty">No one joined in this period.</p>
            <TextLink onClick={() => {
              const next = new URLSearchParams(params);
              next.set("range", "90");
              next.set("view", "pipeline");
              setParams(next);
            }}>Show 90 days</TextLink>
          </div>
        ) : null}
        {showSnap && snap ? (
          <>
            {view === "overview" ? (
              <>
                <OverviewView snap={snap} onOpen={(metric, extra) => void openList(metric, extra)} onPerson={(id) => void openList("stuck", { personId: id })} />
                {officer ? null : (
                  <>
                    <ScoutsView snap={snap} onScout={setScoutId} onDistrict={(name) => setParam("district", name)} />
                    <WeeklyView
                      snap={snap}
                      weeks={weeks}
                      frozen={frozen}
                      onPickWeek={(week) => {
                        if (!week) {
                          setFrozen(null);
                          return;
                        }
                        if (demoKind || !token) {
                          setFrozen(demoSnapshot("demo"));
                          return;
                        }
                        void fetchBriefing(token, week).then((data) => setFrozen(data.snapshot)).catch((err: Error) => setNotice(err.message));
                      }}
                      onFreeze={async (notes: WeeklyNotes) => {
                        if (demoKind || !token) return;
                        await postRecruitment(token, "/briefings", notes);
                      }}
                      onCopy={async (text) => {
                        await navigator.clipboard.writeText(text);
                        setNotice("Copied for WhatsApp.");
                      }}
                    />
                  </>
                )}
              </>
            ) : null}
            {view === "pipeline" ? <PipelineView snap={snap} onOpen={(metric, extra) => void openList(metric, extra)} /> : null}
            {view === "sources" && !officer ? (
              <SourcesView
                snap={snap}
                onOpen={(metric, extra) => void openList(metric, extra)}
                onSpend={async (body) => {
                  if (demoKind || !token) {
                    setNotice("Spend saved in this preview.");
                    return;
                  }
                  await postRecruitment(token, "/spend", body);
                  await load();
                }}
                onLink={async (body) => {
                  if (demoKind || !token) return "/signup?src=demo";
                  const made = (await postRecruitment(token, "/links", body)) as { url?: string; path?: string };
                  return made.url || made.path || "";
                }}
              />
            ) : null}
            {notice ? <p className="rec-note" role="status">{notice}</p> : null}
            {officer ? null : <SourceChip onDefinitions={() => void openDefs()} />}
          </>
        ) : null}
      </div>
      {people ? (
        <Drawer title={listTitle} onClose={() => setPeople(null)}>
          <PeopleList people={people} onReveal={officer ? undefined : async (personId) => {
              if (demoKind || !token) {
                setPeople((rows) =>
                  (rows || []).map((row) =>
                    row.personId === personId ? { ...row, phone: "0780000000", phoneMasked: false } : row
                  )
                );
                return;
              }
              const revealed = (await postRecruitment(token, "/reveal", { personId })) as { person: PersonRow };
              setPeople((rows) => (rows || []).map((row) => (row.personId === personId ? revealed.person : row)));
            }}
          />
        </Drawer>
      ) : null}
      {scout ? (
        <Drawer title={scout.statusLabel} onClose={() => setScoutId(null)}>
          <p className="rec-count">{scout.lots} lots · {scout.sellers} sellers · {scout.buyers ?? 0} buyers</p>
          <p className="rec-note">{scout.district || "District unknown"}</p>
          <TextLink href={companyHref("/farm/pipeline/people")}>Open people book</TextLink>
        </Drawer>
      ) : null}
      {defsOpen ? (
        <Drawer title="Definitions" onClose={() => setDefsOpen(false)}>
          <ul className="rec-people">
            {defs.map((row) => (
              <li key={row.id}>
                <p className="font-semibold">{row.label}</p>
                <p className="rec-note">{row.definition}</p>
                {"formula" in row && row.formula ? <p className="rec-note">{String(row.formula)}</p> : null}
              </li>
            ))}
          </ul>
          {defSql ? <pre className="rec-copy">{defSql}</pre> : null}
          {snap?.quality ? (
            <p className="rec-note">
              Confidence {snap.quality.confidence}
              {snap.quality.reconciliation.ok ? " · checks passed" : " · check failed"}
            </p>
          ) : null}
        </Drawer>
      ) : null}
    </PageHeader>
  );
}
