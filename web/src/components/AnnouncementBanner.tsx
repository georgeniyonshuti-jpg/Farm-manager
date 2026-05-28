import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { useAuth } from "../auth/AuthContext";

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
};

const DISMISS_KEY = "fm_dismissed_announcements";

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
}

export function AnnouncementBanner() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  useEffect(() => {
    if (!user || !token) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/announcements/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json()) as { announcements?: Announcement[] };
        if (mounted && res.ok) {
          setItems(body.announcements ?? []);
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, user]);

  const visible = items.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const current = visible[0];
  const tone =
    current.type === "warning"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
      : current.type === "maintenance"
        ? "border-blue-500/40 bg-blue-500/10 text-blue-100"
        : "border-[var(--primary-color)]/40 bg-[var(--primary-color)]/10 text-[var(--text-primary)]";

  return (
    <div className={`border-b px-4 py-3 text-sm ${tone}`} role="status">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{current.title}</p>
          <p className="mt-0.5 opacity-90">{current.message}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-xs underline opacity-80"
          onClick={() => {
            const next = new Set(dismissed);
            next.add(current.id);
            setDismissed(next);
            writeDismissed(next);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
