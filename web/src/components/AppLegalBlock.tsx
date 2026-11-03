import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiUrl } from "../api/fetchClient";

type Health = { ok: boolean; version: string };

function useApiHealth(): Health | null {
  const { user } = useAuth();
  const enabled = user?.role === "superuser";
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(apiUrl("/health"));
        const d = (await r.json().catch(() => ({}))) as { status?: string; version?: string };
        if (cancelled) return;
        setHealth({ ok: r.ok && d.status === "ok", version: d.version ?? "1.0.0" });
      } catch {
        if (!cancelled) setHealth({ ok: false, version: "" });
      }
    };
    void run();
    const t = window.setInterval(() => void run(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [enabled]);

  return enabled ? health : null;
}

/** Version on the left, copyright on the right. Superusers also see API health. */
export function AppLegalBlock() {
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  const year = new Date().getFullYear();
  const health = useApiHealth();

  return (
    <div className="app-legal-row">
      <p className="app-legal-row__meta">
        <span>v{version}</span>
        {health ? (
          <>
            <span className="app-legal-row__sep" aria-hidden>
              ·
            </span>
            <span
              className={`app-legal-row__dot ${health.ok ? "is-ok" : "is-down"}`}
              aria-hidden
            />
            <span>API {health.ok ? "reachable" : "down"}</span>
          </>
        ) : null}
      </p>
      <p className="app-legal-row__copy">© {year} Cleva Technologies</p>
    </div>
  );
}
