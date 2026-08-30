import { useNavigate } from "react-router-dom";
import { todayItemActionRoute, type FarmTodayItem } from "../../auth/farmBootstrap";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";

function severityClass(severity?: string): string {
  switch (String(severity || "").toLowerCase()) {
    case "red":
      return "border-red-500/40 bg-red-500/10 text-red-100";
    case "amber":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "green":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-primary)]";
  }
}

type TodayChecklistPanelProps = {
  title?: string;
};

export function TodayChecklistPanel({ title = "Today" }: TodayChecklistPanelProps) {
  const navigate = useNavigate();
  const { today, hasBootstrap } = useFarmCapabilities();
  const items = today?.items ?? [];

  if (!hasBootstrap || !items.length) return null;

  function openItem(item: FarmTodayItem) {
    const route = todayItemActionRoute(item);
    if (!route) return;
    if (/^https?:\/\//i.test(route)) {
      try {
        const url = new URL(route);
        navigate(`${url.pathname}${url.search}${url.hash}`);
        return;
      } catch {
        window.location.assign(route);
        return;
      }
    }
    navigate(route);
  }

  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</h2>
      <ul className="grid gap-2">
        {items.map((item) => {
          const key = item.item_id || `${item.category}-${item.title}`;
          const route = todayItemActionRoute(item);
          return (
            <li key={key}>
              <button
                type="button"
                disabled={!route}
                onClick={() => openItem(item)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition hover:opacity-95 disabled:cursor-default disabled:opacity-70 ${severityClass(item.severity)}`}
              >
                <div className="text-sm font-semibold">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-0.5 text-xs opacity-90">{item.subtitle}</div>
                ) : null}
                {route && (item.actionLabel || item.action_label) ? (
                  <div className="mt-2 text-xs font-semibold underline opacity-90">
                    {item.actionLabel || item.action_label}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
