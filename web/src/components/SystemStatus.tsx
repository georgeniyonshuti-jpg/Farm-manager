import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiUrl } from "../api/fetchClient";

type HealthResponse = {
  status?: string;
  version?: string;
};

export function SystemStatus() {
  const { user } = useAuth();
  const [ok, setOk] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string>("-");

  useEffect(() => {
    if (user?.role !== "superuser") return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(apiUrl("/health"));
        const d = (await r.json().catch(() => ({}))) as HealthResponse;
        if (cancelled) return;
        setOk(r.ok && d.status === "ok");
        setVersion(d.version ?? "1.0.0");
      } catch {
        if (!cancelled) setOk(false);
      }
    };
    void run();
    const t = window.setInterval(() => void run(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [user?.role]);

  if (user?.role !== "superuser") return null;

  return (
    <div className="fixed bottom-3 right-3 z-50 rounded-xl border border-neutral-700 bg-neutral-900/85 px-3 py-2 text-xs text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
        <span>API {ok ? "reachable" : "down"}</span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-300">v{version}</p>
    </div>
  );
}
