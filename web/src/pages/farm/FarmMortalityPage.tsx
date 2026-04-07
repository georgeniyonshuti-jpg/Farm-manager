import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";

type MortalityRow = {
  id: string;
  at: string;
  count: number;
  isEmergency: boolean;
  notes: string;
  source: string;
  linkedCheckinId: string | null;
};

export function FarmMortalityPage() {
  const { token } = useAuth();
  const tTitle = useLaborerT("Mortality tracking");
  const tLead = useLaborerT(
    "Events from round check-ins and ad-hoc / emergency logs (with photos stored on server in demo)."
  );
  const tLog = useLaborerT("Log mortality");
  const tTime = useLaborerT("Time");
  const tCount = useLaborerT("Count");
  const tType = useLaborerT("Type");
  const tNotes = useLaborerT("Notes");
  const tEmptyTitle = useLaborerT("No mortality logged yet");
  const tEmptyBody = useLaborerT("Submit losses from the mortality log — photos are required.");
  const [rows, setRows] = useState<MortalityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const fr = await fetch("/api/flocks", { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error);
      const id = (fd.flocks as { id: string }[])[0]?.id;
      if (!id) {
        setRows([]);
        return;
      }
      const mr = await fetch(`/api/flocks/${id}/mortality-events`, { headers: readAuthHeaders(token) });
      const md = await mr.json();
      if (!mr.ok) throw new Error(md.error);
      setRows((md.events as MortalityRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
      <PageHeader
        title={tTitle}
        subtitle={tLead}
        action={
          <Link
            to="/farm/mortality-log"
            className="inline-flex rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {tLog}
          </Link>
        }
      />

      {loading && <SkeletonList rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && rows.length === 0 && (
        <EmptyState title={tEmptyTitle} description={tEmptyBody} />
      )}

      {!loading && !error && rows.length > 0 ? (
        <>
          <ul className="mt-4 space-y-3 sm:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
                <div className="flex justify-between font-mono text-xs text-neutral-600">
                  <span>{r.at}</span>
                  <span className="font-semibold text-neutral-900">
                    {tCount}: {r.count}
                  </span>
                </div>
                <p className="mt-2 font-medium text-neutral-800">
                  {r.isEmergency ? (
                    <TranslatedText text="Emergency" />
                  ) : (
                    <TranslatedText
                      text={r.source?.replace(/_/g, " ").trim() || "—"}
                    />
                  )}
                </p>
                <p className="mt-1 text-neutral-600">{r.notes || "—"}</p>
              </li>
            ))}
          </ul>
          <div className="institutional-table-wrapper mt-4 hidden overflow-x-auto sm:block">
            <table className="institutional-table min-w-[28rem] text-sm">
              <thead>
                <tr>
                  <th>{tTime}</th>
                  <th>{tCount}</th>
                  <th>{tType}</th>
                  <th>{tNotes}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{r.at}</td>
                    <td>{r.count}</td>
                    <td>
                      {r.isEmergency ? (
                        <TranslatedText text="Emergency" />
                      ) : (
                        <TranslatedText
                          text={r.source?.replace(/_/g, " ").trim() || "—"}
                        />
                      )}
                    </td>
                    <td>{r.notes || <TranslatedText text="—" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
