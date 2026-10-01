import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { StatusPill, type StatusTone } from "../ui/StatusPill";
import { useCompanyNav } from "../../hooks/useCompanyNav";

export type FarmInsight = {
  id: string;
  severity: "critical" | "warn" | "info";
  category?: string;
  message: string;
  actionHint?: string;
  flockId?: string;
  flockLabel?: string;
};

type Props = {
  items: FarmInsight[];
  title?: string;
  className?: string;
};

function toneFor(sev: FarmInsight["severity"]): StatusTone {
  if (sev === "critical") return "danger";
  if (sev === "warn") return "warning";
  return "info";
}

export function InsightsFeed({ items, title = "What needs attention", className = "" }: Props) {
  const { companyHref } = useCompanyNav();
  if (!items.length) return null;

  return (
    <Card level="elevated" className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-h3 text-[var(--text-primary)]">{title}</h2>
        <StatusPill tone="neutral">{items.length}</StatusPill>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">{item.message}</p>
              <StatusPill tone={toneFor(item.severity)}>{item.severity}</StatusPill>
            </div>
            {item.actionHint ? <p className="mt-1 type-caption">{item.actionHint}</p> : null}
            {item.flockId ? (
              <Link
                to={companyHref("/farm/flocks")}
                className="mt-1 inline-block text-xs font-semibold text-[var(--primary-color)] underline"
              >
                Open flocks
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
