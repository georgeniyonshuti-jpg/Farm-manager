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
  const navSchedule = useLaborerT("Schedule");

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
    if (!status) return { tone: "bg-amber-100 text-amber-900", text: tNoScheduleBanner };
    void tick;
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
    { to: "/dashboard/laborer", label: navHome },
    { to: "/farm/checkin", label: navRound },
    { to: "/farm/mortality-log", label: navMort },
    { to: "/farm/daily-log", label: navLog },
    { to: "/farm/mortality", label: navHistory },
    { to: "/farm/batch-schedule", label: navSchedule },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className={`rounded-xl px-4 py-3 text-sm font-semibold leading-6 ${roundBanner.tone}`}>
        {roundBanner.text}
      </div>
      <PageHeader
        className="mb-3 gap-3"
        title={hTitle}
        subtitle={hSub}
        action={
          <Link
            to="/farm/batch-schedule"
            className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            {batchCta}
          </Link>
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
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">{medTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{medBody}</p>
          <Link
            to="/farm/treatments"
            className="mt-3 inline-block rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800"
          >
            {medLink}
          </Link>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">{slTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{slBody}</p>
          <Link
            to="/farm/slaughter"
            className="mt-3 inline-block rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800"
          >
            {slLink}
          </Link>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white px-2 py-2 sm:hidden">
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
