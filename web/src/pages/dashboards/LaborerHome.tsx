import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinStatusBlock, type CheckinStatus } from "../farm/FarmCheckinPage";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";

export function LaborerHome() {
  const { token, user } = useAuth();
  const isJuniorVet = user?.role === "vet" || user?.departmentKeys.includes("junior_vet");
  const hTitle = isJuniorVet ? "Intera ya Vet Muto" : "Ikigo cy'ibikorwa";
  const hSub = isJuniorVet
    ? "Gukurikirana rounds, ubuzima bw'amatungo n'ibyihutirwa."
    : "Ibikorwa bya buri munsi kuri telefone.";
  const linkCheckin = "Round checking";
  const linkMort = "Andika impfu";
  const linkDaily = "Raporo y'umunsi";
  const linkTable = "Imbonerahamwe y'impfu";
  const linkInv = "Ububiko bw'ibiryo";
  const linkEarnings = "Ihembo ryanjye";
  const noFlockTitle = "Nta flock ibonetse";
  const noFlockBody = "Status ya round checking igaragara gusa iyo flock ihari.";

  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      // ENV: moved to environment variable
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Flocks failed");
      const id = (fd.flocks as { id: string }[])[0]?.id;
      if (!id) {
        setStatus(null);
        return;
      }
      // ENV: moved to environment variable
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

  const roundBanner = useMemo(() => {
    if (loading) return { tone: "bg-neutral-200 text-neutral-700", text: "Round checking iri gutegurwa..." };
    if (loadError) return { tone: "bg-red-100 text-red-800", text: "Round checking ifite ikibazo. Ongera ugerageze." };
    if (!status) return { tone: "bg-amber-100 text-amber-900", text: "Nta round schedule iraboneka kuri ubu." };
    if (status.checkinBadge === "overdue")
      return { tone: "bg-red-100 text-red-900", text: "Round checking yakererewe. Kora igenzura ako kanya." };
    if (status.checkinBadge === "upcoming")
      return { tone: "bg-amber-100 text-amber-900", text: "Round checking iri hafi kugera." };
    return { tone: "bg-emerald-100 text-emerald-900", text: "Round checking iri ku gihe." };
  }, [loading, loadError, status]);

  const bottomNav: Array<{ to: string; label: string }> = [
    { to: "/farm/checkin", label: "Round" },
    { to: "/farm/mortality-log", label: "Impfu" },
    { to: "/farm/daily-log", label: "Raporo" },
    { to: "/farm/mortality", label: "Amateka" },
    { to: "/farm/inventory", label: "Ububiko" },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${roundBanner.tone}`}>
        {roundBanner.text}
      </div>
      <PageHeader title={hTitle} subtitle={hSub} />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError && (
        <ErrorState message={loadError} onRetry={() => void load()} />
      )}

      {!loading && !loadError && status && <CheckinStatusBlock status={status} />}
      {!loading && !loadError && !status ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      <div className="grid gap-3">
        <Link
          to="/farm/checkin"
          className="flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-800 px-4 text-lg font-semibold text-white shadow hover:bg-emerald-900"
        >
          {linkCheckin}
        </Link>
        <Link
          to="/farm/mortality-log"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50/80 px-4 text-lg font-semibold text-red-900 hover:bg-red-50"
        >
          {linkMort}
        </Link>
        <Link
          to="/farm/daily-log"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {linkDaily}
        </Link>
        <Link
          to="/farm/mortality"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {linkTable}
        </Link>
        <Link
          to="/farm/inventory"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {linkInv}
        </Link>
        <Link
          to="/laborer/earnings"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 text-lg font-semibold text-emerald-900 hover:bg-emerald-50"
        >
          {linkEarnings}
        </Link>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white px-2 py-2 sm:hidden">
        <div className="grid grid-cols-5 gap-1">
          {bottomNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-2 py-2 text-center text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
