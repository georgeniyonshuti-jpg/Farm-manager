import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinStatusBlock, type CheckinStatus } from "../farm/FarmCheckinPage";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";

function kigaliNowDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Kigali" }));
}

export function LaborerHome() {
  const { token, user } = useAuth();
  const isJuniorVet = user?.role === "vet" || user?.departmentKeys.includes("junior_vet");

  const hTitleJunior = useLaborerT("Junior vet hub");
  const hTitleLaborer = useLaborerT("Field operations hub");
  const hSubJunior = useLaborerT("Track rounds, flock health, and urgent work.");
  const hSubLaborer = useLaborerT("Daily tasks optimized for your phone.");
  const linkCheckin = useLaborerT("Round check-in");
  const linkMort = useLaborerT("Log mortality");
  const linkDaily = useLaborerT("Daily log");
  const linkTable = useLaborerT("Mortality table");
  const linkInv = useLaborerT("Feed inventory");
  const linkEarnings = useLaborerT("My earnings");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Round status appears when a flock is assigned to your site.");
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
  const navHistory = useLaborerT("History");
  const navStock = useLaborerT("Stock");

  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Flocks failed");
      const id = (fd.flocks as { id: string }[])[0]?.id;
      if (!id) {
        setStatus(null);
        return;
      }
      const sr = await fetch(`${API_BASE_URL}/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error(sd.error ?? "Status failed");
      setStatus(sd as CheckinStatus);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schedule");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setClockTick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  const roundBanner = useMemo(() => {
    if (loading) return { tone: "bg-neutral-200 text-neutral-700", text: tLoadingBanner };
    if (loadError) return { tone: "bg-red-100 text-red-800", text: tErrBanner };
    if (!status) return { tone: "bg-amber-100 text-amber-900", text: tNoScheduleBanner };
    void clockTick;
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
    clockTick,
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
    { to: "/dashboard/laborer", label: navHome },
    { to: "/farm/checkin", label: navRound },
    { to: "/farm/mortality-log", label: navMort },
    { to: "/farm/daily-log", label: navLog },
    { to: "/farm/mortality", label: navHistory },
    { to: "/farm/inventory", label: navStock },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className={`rounded-xl px-4 py-3 text-sm font-semibold leading-6 ${roundBanner.tone}`}>
        {roundBanner.text}
      </div>
      <PageHeader
        className="mb-3 gap-3"
        title={isJuniorVet ? hTitleJunior : hTitleLaborer}
        subtitle={isJuniorVet ? hSubJunior : hSubLaborer}
      />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError && (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      )}

      {!loading && !loadError && status && <CheckinStatusBlock status={status} showWarning={false} />}
      {!loading && !loadError && !status ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      <div className="grid gap-3">
        <Link
          to="/farm/checkin"
          className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl bg-[var(--primary-color)] px-4 text-lg font-semibold text-white shadow hover:bg-[var(--primary-color-dark)]"
        >
          {linkCheckin}
        </Link>
        <Link
          to="/farm/mortality-log"
          className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50/80 px-4 text-lg font-semibold text-red-900 hover:bg-red-50"
        >
          {linkMort}
        </Link>
        <Link
          to="/farm/daily-log"
          className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
        >
          {linkDaily}
        </Link>
        <Link
          to="/farm/mortality"
          className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
        >
          {linkTable}
        </Link>
        <Link
          to="/farm/inventory"
          className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
        >
          {linkInv}
        </Link>
        <Link
          to="/laborer/earnings"
          className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--primary-color)]/30 bg-[var(--primary-color-soft)] px-4 text-lg font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
        >
          {linkEarnings}
        </Link>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-color)] bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-6 gap-1">
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
