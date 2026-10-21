import { NavLink } from "react-router-dom";
import { useCompanyNav } from "../../hooks/useCompanyNav";

export type LaneItem = { to: string; label: string; end?: boolean };

/** Underline links for one job (Health, Stock, or Insights). */
export function LaneNav({
  label,
  items,
  chrome = false,
}: {
  label: string;
  items: LaneItem[];
  /** Sit in the desktop top-bar tab row. */
  chrome?: boolean;
}) {
  const { companyHref } = useCompanyNav();
  return (
    <div
      className={
        chrome
          ? "flex h-full items-stretch gap-0.5 overflow-x-auto"
          : "mb-3 flex items-stretch gap-0.5 overflow-x-auto border-b border-[var(--border-color)]"
      }
      role="navigation"
      aria-label={label}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={companyHref(item.to)}
          end={item.end}
          className={({ isActive }) =>
            `inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold ${
              chrome ? "" : "py-2"
            } ${
              isActive
                ? "border-[var(--primary-color)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export const HEALTH_LANE: LaneItem[] = [
  { to: "/farm/vet-logs", label: "Vet logs" },
  { to: "/farm/treatments", label: "Medicine" },
  { to: "/farm/mortality", label: "Mortality" },
  { to: "/farm/checkin-review", label: "Check-ins" },
];

export const STOCK_LANE: LaneItem[] = [
  { to: "/farm/inventory", label: "Feed" },
  { to: "/farm/slaughter", label: "Slaughter" },
];

export const INSIGHTS_LANE: LaneItem[] = [
  { to: "/dashboard/market", label: "Overview", end: true },
  { to: "/dashboard/market/recruitment", label: "Recruitment" },
  { to: "/dashboard/market/trends", label: "Trends" },
];
