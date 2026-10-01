import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useOpsBoardData } from "../../hooks/useOpsBoardData";

type Props = {
  open: boolean;
  onClose: () => void;
};

const PAGES: Array<{ label: string; to: string; keywords: string }> = [
  { label: "Today", to: "/dashboard/management", keywords: "command center home today" },
  { label: "Trends", to: "/dashboard/management?tab=trends", keywords: "charts analytics scorecard" },
  { label: "Flocks", to: "/farm/flocks", keywords: "birds flocks" },
  { label: "Vet logs", to: "/farm/vet-logs", keywords: "health visit" },
  { label: "Medicine", to: "/farm/treatments", keywords: "treatment rounds" },
  { label: "Mortality tracking", to: "/farm/mortality", keywords: "deaths" },
  { label: "Review check-ins", to: "/farm/checkin-review", keywords: "approve rounds" },
  { label: "Feed inventory", to: "/farm/inventory", keywords: "stock feed" },
  { label: "Slaughter", to: "/farm/slaughter", keywords: "harvest" },
  { label: "Market", to: "/farm/pipeline", keywords: "marketplace buyers match lots desk ops book pricing scouts" },
  { label: "Market · Buyers", to: "/farm/pipeline?tab=buyers", keywords: "buyer crm leads verify locks" },
  { label: "Market · Pricing", to: "/farm/pipeline?tab=pricing", keywords: "board farm-gate butcher quote week rates" },
  { label: "Market · Scouts", to: "/farm/pipeline?tab=scouts", keywords: "weigh visit commission pay" },
  { label: "Market · Today", to: "/farm/pipeline?tab=today", keywords: "queue jobs fulfillment exceptions" },
  { label: "Live market", to: "/market", keywords: "buy birds book lot" },
  { label: "Farm storefronts", to: "/market/farms", keywords: "farm profile photos" },
  { label: "Commissions", to: "/market/commissions", keywords: "scout payout unpaid" },
  { label: "My listings", to: "/market/listings", keywords: "farmer sell birds" },
  { label: "Inventory scout", to: "/farm/pipeline/scout", keywords: "vet scout lot" },
  { label: "Weigh visits", to: "/farm/pipeline/weigh", keywords: "scout weigh visit book" },
  { label: "Users", to: "/admin/users", keywords: "people admin" },
  { label: "Lists & types", to: "/admin/system-config", keywords: "settings types" },
  { label: "Payroll", to: "/farm/payroll", keywords: "earnings" },
  { label: "Reports", to: "/farm/reports", keywords: "csv export" },
];

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { companyHref } = useCompanyNav();
  const { token } = useAuth();
  const { data } = useOpsBoardData(token);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages = PAGES.filter(
      (p) => !needle || p.label.toLowerCase().includes(needle) || p.keywords.includes(needle)
    ).map((p) => ({ kind: "page" as const, label: p.label, to: p.to }));
    const flocks = (data?.flocks ?? [])
      .filter((f) => !needle || f.label.toLowerCase().includes(needle) || f.flockId.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((f) => ({
        kind: "flock" as const,
        label: `Flock ${f.label}`,
        to: `/farm/flocks/${encodeURIComponent(f.flockId)}`,
      }));
    const pending =
      !needle || /pending|review/.test(needle)
        ? [{ kind: "page" as const, label: "Pending reviews", to: "/farm/checkin-review" }]
        : [];
    return [...pages, ...pending, ...flocks];
  }, [q, data?.flocks]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHi(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((i) => Math.min(items.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && items[hi]) {
        e.preventDefault();
        navigate(companyHref(items[hi].to));
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, hi, navigate, companyHref, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close search" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Search farm"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]"
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
          }}
          placeholder="Go to a page or flock…"
          className="w-full border-b border-[var(--border-color)] bg-transparent px-4 py-3 text-sm text-[var(--text-primary)] outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-[var(--text-muted)]">No matches</li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.kind}-${item.to}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === hi}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                    i === hi ? "bg-[var(--primary-color-soft)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => {
                    navigate(companyHref(item.to));
                    onClose();
                  }}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{item.kind}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
