import { ChevronRight } from "lucide-react";

export type FieldHistoryItem = {
  id: string;
  primary: string;
  meta?: string;
  onClick?: () => void;
};

type Props = {
  title?: string;
  items: FieldHistoryItem[];
  emptyText?: string;
};

/** Compact recent-event list for field task hubs. */
export function FieldHistoryList({ title, items, emptyText = "Nothing logged yet." }: Props) {
  return (
    <section className="space-y-2">
      {title ? <p className="type-h3 text-[var(--text-primary)]">{title}</p> : null}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              {item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3 text-left transition hover:border-[var(--primary-color)]/30"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.primary}</span>
                    {item.meta ? (
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{item.meta}</span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                </button>
              ) : (
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.primary}</p>
                  {item.meta ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.meta}</p> : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>
      )}
    </section>
  );
}
