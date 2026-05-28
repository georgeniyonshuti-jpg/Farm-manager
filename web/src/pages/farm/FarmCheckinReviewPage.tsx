import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";

type PendingCheckin = {
  id: string;
  flockId: string;
  laborerId: string;
  at: string;
  submissionStatus?: string;
  photoUrl?: string | null;
  photoUrls?: unknown;
  coopTemperatureC?: number | null;
  feedKg?: number;
  waterL?: number;
  mortalityAtCheckin?: number;
  mortalityReportedInMortalityLog?: boolean;
  feedAvailable?: boolean;
  waterAvailable?: boolean;
  notes?: string;
  laborerName?: string;
  flockCode?: string;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
};

type PhotoSlots = {
  flockSign: string[];
  thermometer: string[];
  feed: string[];
  water: string[];
};

function toPhotoSlots(checkin: PendingCheckin): PhotoSlots {
  const toArray = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => x.length > 20) : []);
  const urls = checkin.photoUrls;
  const out: PhotoSlots = { flockSign: [], thermometer: [], feed: [], water: [] };
  if (Array.isArray(urls)) {
    out.flockSign = toArray(urls);
  } else if (urls && typeof urls === "object") {
    const rec = urls as Record<string, unknown>;
    out.flockSign = toArray(rec.flockSign ?? rec.photos);
    out.thermometer = toArray(rec.thermometer);
    out.feed = toArray(rec.feed);
    out.water = toArray(rec.water);
  }
  if (out.flockSign.length === 0 && checkin.photoUrl) out.flockSign = [String(checkin.photoUrl)];
  return out;
}

export function FarmCheckinReviewPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [checkins, setCheckins] = useState<PendingCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/check-ins/pending`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setCheckins((d as { checkins?: PendingCheckin[] }).checkins ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const r = await fetch(`${API_BASE_URL}/api/check-ins/${encodeURIComponent(id)}/review`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", action === "approve" ? "Check-in approved." : "Check-in rejected.");
      void load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  function rowToCsv(checkinsToExport: PendingCheckin[]): string {
    const header = [
      "id",
      "flockId",
      "flockCode",
      "submitterId",
      "submitterName",
      "submittedAt",
      "submissionStatus",
      "coopTemperatureC",
      "feedAvailable",
      "waterAvailable",
      "feedKg",
      "waterL",
      "mortalityAtCheckin",
      "mortalityReportedInMortalityLog",
      "notes",
      "flockSignPhotos",
      "thermometerPhotos",
      "feedPhotos",
      "waterPhotos",
    ];
    const lines = [header.join(",")];
    for (const c of checkinsToExport) {
      const slots = toPhotoSlots(c);
      const row = [
        c.id,
        c.flockId,
        c.flockCode ?? "",
        c.laborerId,
        c.laborerName ?? "",
        c.at,
        c.submissionStatus ?? "",
        c.coopTemperatureC == null ? "" : String(c.coopTemperatureC),
        String(Boolean(c.feedAvailable)),
        String(Boolean(c.waterAvailable)),
        String(Number(c.feedKg ?? 0)),
        String(Number(c.waterL ?? 0)),
        String(Number(c.mortalityAtCheckin ?? 0)),
        String(Boolean(c.mortalityReportedInMortalityLog)),
        c.notes ?? "",
        slots.flockSign.join(" "),
        slots.thermometer.join(" "),
        slots.feed.join(" "),
        slots.water.join(" "),
      ].map((v) => JSON.stringify(String(v)));
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }

  function downloadCsv(checkinsToExport: PendingCheckin[], filename: string) {
    const csv = rowToCsv(checkinsToExport);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Review round check-ins"
        subtitle="Approve laborer and junior vet submissions. Payroll is approved separately under Payroll."
        action={
          <Link
            to="/farm/payroll"
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            Payroll
          </Link>
        }
      />

      {loading && <SkeletonList rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && checkins.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No check-ins pending review.</p>
      ) : null}

      {!loading && !error && checkins.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => downloadCsv(checkins, `checkins-pending-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            Download pending CSV
          </button>
        </div>
      ) : null}

      {!loading && !error && checkins.length > 0 ? (
        <ul className="space-y-3">
          {checkins.map((c) => (
            <li key={c.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 text-sm shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {c.flockCode ?? c.flockId.slice(0, 8)} · {c.laborerName ?? c.laborerId.slice(0, 8)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                    {new Date(c.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  </p>
                  <p className="mt-2 text-[var(--text-secondary)]">
                    Feed: {c.feedAvailable ? "Yes" : "No"} · Water: {c.waterAvailable ? "Yes" : "No"}
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    Temperature: {c.coopTemperatureC == null ? "—" : `${c.coopTemperatureC} °C`} · Feed kg: {Number(c.feedKg ?? 0)} · Water L: {Number(c.waterL ?? 0)}
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    Mortality: {Number(c.mortalityAtCheckin ?? 0)} · Logged in mortality module: {c.mortalityReportedInMortalityLog ? "Yes" : "No"}
                  </p>
                  {c.notes ? <p className="mt-1 text-[var(--text-muted)]">{c.notes}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadCsv([c], `checkin-${c.id}.csv`)}
                    className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void review(c.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void review(c.id, "reject")}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-red-500"
                  >
                    Reject
                  </button>
                </div>
              </div>
              {(() => {
                const slots = toPhotoSlots(c);
                const groups: Array<[string, string[]]> = [
                  ["Flock sign", slots.flockSign],
                  ["Thermometer", slots.thermometer],
                  ["Feed", slots.feed],
                  ["Water", slots.water],
                ];
                return (
                  <div className="mt-3 space-y-2">
                    {groups.map(([label, images]) => (
                      <div key={`${c.id}-${label}`}>
                        <p className="mb-1 text-xs font-semibold text-[var(--text-muted)]">{label}</p>
                        {images.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {images.map((src, idx) => (
                              <a key={`${label}-${idx}`} href={src} download={`${c.id}-${label}-${idx + 1}.jpg`} className="block overflow-hidden rounded border border-[var(--border-color)]">
                                <img src={src} alt={`${label} ${idx + 1}`} className="h-24 w-full object-cover" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--text-muted)]">No image</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
