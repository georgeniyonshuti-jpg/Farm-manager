import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinStatusBlock, type CheckinStatus } from "../farm/FarmCheckinPage";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import { API_BASE_URL } from "../../api/config";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";

function kigaliNowDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Kigali" }));
}

export function VetHome() {
  const { token } = useAuth();
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [primaryFlockId, setPrimaryFlockId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const hTitle = useLaborerT("Vet hub");
  const hSub = useLaborerT("Track rounds, flock health, and urgent work.");
  const batchCta = useLaborerT("Round schedule");
  const medTitle = useLaborerT("Medicine");
  const medBody = useLaborerT("Record treatments, doses, and withdrawal periods by flock.");
  const medLink = useLaborerT("Open medicine tracking");
  const slTitle = useLaborerT("Slaughter & FCR");
  const slBody = useLaborerT("Record slaughter timing and weights, and review FCR reports.");
  const slLink = useLaborerT("Open slaughter & FCR");
  const fcrTitle = useLaborerT("Cycle FCR");
  const fcrBody = useLaborerT("Feed ÷ flock weight gained vs day-age targets. Mobile-friendly action center.");
  const fcrLink = useLaborerT("Open cycle FCR");
  const tLoadingBanner = useLaborerT("Preparing round check-in status…");
  const tErrBanner = useLaborerT("Could not load round check-in. Try again.");
  const tNoScheduleBanner = useLaborerT("No round schedule available right now.");
  const tOverduePrefix = useLaborerT("Round check-in is overdue by");
  const tOverdueSuffix = useLaborerT("minutes. Inspect the flock now.");
  const tOnTrack = useLaborerT("You are on track.");
  const tAbout = useLaborerT("About");
  const tUntilNext = useLaborerT("minutes until the next round.");
  const tRetry = useLaborerT("Try again");
  const navHome = useLaborerT("Home");
  const navRound = useLaborerT("Round");
  const navMort = useLaborerT("Mortality");
  const navLog = useLaborerT("Log");
  const navFeed = useLaborerT("Feed");
  const navHistory = useLaborerT("History");
  const navSchedule = useLaborerT("Schedule");
  const linkEarnings = useLaborerT("My earnings");

  const [bannerSummary, setBannerSummary] = useState<{
    anyOverdue: boolean;
    maxOverdueMinutes: number;
    overdueLabels: string[];
    minutesUntilSoonestNext: number | null;
    soonestFlockLabel: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const ar = await fetch(`${API_BASE_URL}/api/me/aggregate-checkin-status`, { headers: readAuthHeaders(token) });
      const ad = await ar.json();
      if (!ar.ok) throw new Error(ad.error ?? "Status failed");
      const pid = ad.primaryFlockId != null ? String(ad.primaryFlockId) : null;
      setPrimaryFlockId(pid);
      const primary = ad.primaryStatus as CheckinStatus | null | undefined;
      setStatus(primary ?? null);
      const s = ad.summary;
      if (s) {
        setBannerSummary({
          anyOverdue: Boolean(s.anyOverdue),
          maxOverdueMinutes: Number(s.maxOverdueMinutes) || 0,
          overdueLabels: Array.isArray(s.overdueLabels) ? s.overdueLabels.map(String) : [],
          minutesUntilSoonestNext: s.minutesUntilSoonestNext != null ? Number(s.minutesUntilSoonestNext) : null,
          soonestFlockLabel: s.soonestFlockLabel != null ? String(s.soonestFlockLabel) : null,
        });
      } else {
        setBannerSummary(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schedule");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  const roundBanner = useMemo(() => {
    if (loading) return { tone: "bg-neutral-200 text-neutral-700", text: tLoadingBanner };
    if (loadError) return { tone: "bg-red-100 text-red-800", text: tErrBanner };
    if (!status && !bannerSummary) return { tone: "bg-amber-100 text-amber-900", text: tNoScheduleBanner };
    void tick;
    if (bannerSummary?.anyOverdue) {
      const mins = Math.max(1, bannerSummary.maxOverdueMinutes);
      const extra =
        bannerSummary.overdueLabels.length > 0
          ? ` (${bannerSummary.overdueLabels.slice(0, 3).join(", ")})`
          : "";
      return {
        tone: "bg-red-100 text-red-900",
        text: `${tOverduePrefix} ${mins} ${tOverdueSuffix}${extra}`,
      };
    }
    if (
      bannerSummary &&
      !bannerSummary.anyOverdue &&
      bannerSummary.minutesUntilSoonestNext != null &&
      bannerSummary.soonestFlockLabel
    ) {
      const minsLeft = Math.max(1, bannerSummary.minutesUntilSoonestNext);
      return {
        tone: "bg-emerald-100 text-emerald-900",
        text: `${tOnTrack} ${tAbout} ${minsLeft} ${tUntilNext} (${bannerSummary.soonestFlockLabel})`,
      };
    }
    if (!status) return { tone: "bg-amber-100 text-amber-900", text: tNoScheduleBanner };
    const now = kigaliNowDate().getTime();
    const next = new Date(status.nextDueAt).getTime();
    if (now > next) {
      const mins = Math.floor((now - next) / 60000);
      return {
        tone: "bg-red-100 text-red-900",
        text: `${tOverduePrefix} ${Math.max(1, mins)} ${tOverdueSuffix}`,
      };
    }
    const minsLeft = Math.floor((next - now) / 60000);
    return {
      tone: "bg-emerald-100 text-emerald-900",
      text: `${tOnTrack} ${tAbout} ${Math.max(1, minsLeft)} ${tUntilNext}`,
    };
  }, [
    loading,
    loadError,
    status,
    bannerSummary,
    tick,
    tLoadingBanner,
    tErrBanner,
    tNoScheduleBanner,
    tOverduePrefix,
    tOverdueSuffix,
    tOnTrack,
    tAbout,
    tUntilNext,
  ]);

  const bottomNav: Array<{ to: string; label: string }> = [
    { to: "/dashboard/vet", label: navHome },
    { to: "/farm/checkin", label: navRound },
    { to: "/farm/mortality-log", label: navMort },
    { to: "/farm/feed", label: navFeed },
    { to: "/farm/daily-log", label: navLog },
    { to: "/farm/mortality", label: navHistory },
    { to: "/farm/batch-schedule", label: navSchedule },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className={`rounded-xl px-4 py-3 text-sm font-semibold leading-6 ${roundBanner.tone}`}>
        {roundBanner.text}
      </div>
      <PageHeader
        className="mb-3 gap-3"
        title={hTitle}
        subtitle={hSub}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/laborer/earnings"
              className="bounce-tap rounded-xl border border-[var(--primary-color)]/40 px-4 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
            >
              {linkEarnings}
            </Link>
            <Link
              to="/farm/batch-schedule"
              className="bounce-tap rounded-xl bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)]"
            >
              {batchCta}
            </Link>
          </div>
        }
      />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError ? (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      ) : null}
      {!loading && !loadError && status ? <CheckinStatusBlock status={status} showWarning={false} /> : null}

      <div className="grid gap-4">
        <section className="app-surface p-4">
          <h2 className="text-sm font-semibold text-neutral-800">{medTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{medBody}</p>
          <Link
            to="/farm/treatments"
            className="bounce-tap mt-3 inline-block rounded-xl border border-[var(--primary-color)]/40 px-3 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {medLink}
          </Link>
        </section>
        <section className="app-surface p-4">
          <h2 className="text-sm font-semibold text-neutral-800">{fcrTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{fcrBody}</p>
          <Link
            to={primaryFlockId ? `/farm/flocks/${encodeURIComponent(primaryFlockId)}/fcr` : "/farm/fcr"}
            className="bounce-tap mt-3 inline-block rounded-xl border border-[var(--primary-color)]/40 px-3 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {fcrLink}
          </Link>
        </section>
        <section className="app-surface p-4">
          <h2 className="text-sm font-semibold text-neutral-800">{slTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{slBody}</p>
          <Link
            to="/farm/slaughter"
            className="bounce-tap mt-3 inline-block rounded-xl border border-[var(--primary-color)]/40 px-3 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {slLink}
          </Link>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-color)] bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-7 gap-1">
          {bottomNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-2 py-3 text-center text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
