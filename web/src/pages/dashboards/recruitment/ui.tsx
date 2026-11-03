import { useEffect, type ReactNode } from "react";
import { Button, FacetFilter, IconButton, SegmentedControl, TableToolbar, TextLink } from "../../../components/ui";
import type { CommandTile, WorkRow } from "./api";

export function StaleBanner({ asOf, reason }: { asOf: string; reason?: string | null }) {
  return (
    <p className="rec-stale" role="status">
      <span className="rec-mark" aria-hidden>!</span>
      Data as of {asOf}. Last refresh failed{reason ? `: ${reason}` : ""}.
    </p>
  );
}

export function SourceChip({ onDefinitions }: { onDefinitions: () => void }) {
  return (
    <p className="rec-source">
      <TextLink onClick={onDefinitions}>Definitions</TextLink>
    </p>
  );
}

export function FilterBar({
  showRange,
  range,
  onRange,
  channel,
  channels,
  onChannel,
  district,
  districts,
  onDistrict,
  asOf,
  onRefresh,
}: {
  showRange: boolean;
  range: string;
  onRange: (value: string) => void;
  channel: string;
  channels: { id: string; label: string }[];
  onChannel: (value: string) => void;
  district: string;
  districts: string[];
  onDistrict: (value: string) => void;
  asOf: string;
  onRefresh: () => void;
}) {
  return (
    <TableToolbar
      filters={
        <>
          {showRange ? (
            <SegmentedControl
              label="Range"
              size="sm"
              value={range}
              onChange={onRange}
              options={[
                { value: "7", label: "7d" },
                { value: "30", label: "30d" },
                { value: "90", label: "90d" },
              ]}
            />
          ) : null}
          <FacetFilter
            label="Channel"
            value={channel}
            allValue=""
            onChange={onChannel}
            options={channels.map((row) => ({ value: row.id, label: row.label }))}
          />
          <FacetFilter
            label="District"
            value={district}
            allValue=""
            onChange={onDistrict}
            options={districts.map((name) => ({ value: name, label: name }))}
          />
        </>
      }
      meta={asOf ? `Updated ${asOf}` : undefined}
      actions={
        <IconButton label={`Refresh. Data as of ${asOf}`} size="sm" onClick={onRefresh}>
          <span aria-hidden>↻</span>
        </IconButton>
      }
    />
  );
}

function deltaLine(delta: string | null) {
  if (!delta) return null;
  if (delta === "same") return { icon: "→", word: "Same as last week", tone: "flat" };
  const signed = delta.startsWith("-") ? delta.replace("-", "−") : delta;
  return { icon: delta.startsWith("-") ? "▼" : "▲", word: `${signed} vs last week`, tone: delta.startsWith("-") ? "down" : "up" };
}

function tickStyle(pct: number): { left?: string; right?: string; transform?: string } {
  if (pct >= 92) return { right: "0", transform: "none" };
  return { left: `${pct}%` };
}

export function TargetBar({ value, target, targetT2 }: { value: number | null; target: number | null; targetT2: number | null }) {
  const max = Math.max(value || 0, target || 0, targetT2 || 0, 1);
  const width = value == null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="rec-track" aria-hidden>
      <span className="rec-track-fill" style={{ width: `${width}%` }} />
      {target != null ? <span className="rec-tick" style={tickStyle((target / max) * 100)}>target</span> : null}
      {targetT2 != null ? <span className="rec-tick rec-tick-t2" style={tickStyle((targetT2 / max) * 100)}>stretch</span> : null}
    </div>
  );
}

export function Sparkline({ points }: { points: number[] }) {
  const values = points.length ? points : [0];
  const max = Math.max(...values, 1);
  const step = values.length === 1 ? 0 : 100 / (values.length - 1);
  const d = values.map((n, i) => `${i === 0 ? "M" : "L"} ${i * step} ${28 - (n / max) * 24}`).join(" ");
  return (
    <svg className="rec-spark" viewBox="0 0 100 32" role="img" aria-label="Last six weeks">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function HeroTile({ tile, onOpen }: { tile: CommandTile; onOpen: () => void }) {
  const delta = deltaLine(tile.delta);
  const unavailable = Boolean(tile.unavailable || tile.value == null);
  const spoken = unavailable ? "Unavailable" : tile.target != null ? `${tile.value} of ${tile.target}` : String(tile.value);
  return (
    <Button type="button" variant="ghost" className={`rec-tile ${unavailable ? "rec-hatch" : ""}`} onClick={onOpen} aria-label={`${tile.label} ${spoken}`}>
      <span className="rec-tile-label">{tile.label}</span>
      {unavailable ? (
        <span className="rec-unavailable">Unavailable</span>
      ) : (
        <span className="rec-hero-row">
          <span className="rec-hero">{tile.value}</span>
          {tile.target != null ? <span className="rec-of">/ {tile.target}</span> : null}
        </span>
      )}
      {!unavailable && tile.target != null ? <TargetBar value={tile.value} target={tile.target} targetT2={tile.targetT2} /> : null}
      {delta ? (
        <span className="rec-tile-foot">
          <span className={`rec-delta rec-delta-${delta.tone}`}>
            <span aria-hidden>{delta.icon}</span> {delta.word}
          </span>
        </span>
      ) : null}
    </Button>
  );
}

export function DotPipeline({
  rows,
  onOpen,
}: {
  rows: { stage: string; label: string; count: number }[];
  onOpen: (stage: string) => void;
}) {
  return (
    <div className="rec-dots">
      {rows.map((row) => {
        const dots = Math.min(row.count, 18);
        return (
          <Button key={row.stage} variant="ghost" className="rec-dot-row" onClick={() => onOpen(row.stage)}>
            <span className="rec-dot-label">{row.label}</span>
            <span className="rec-dot-run" aria-hidden>
              {Array.from({ length: dots }, (_, i) => <i key={i} />)}
            </span>
            <span className="rec-count">{row.count}</span>
          </Button>
        );
      })}
    </div>
  );
}

export function BarRow({
  label,
  value,
  max,
  suffix,
  onOpen,
  hatch = false,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  onOpen?: () => void;
  hatch?: boolean;
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const body = (
    <>
      <span className="rec-bar-label">{label}</span>
      <span className="rec-count">{suffix || value}</span>
      <span className={`rec-bar-track ${hatch ? "rec-hatch" : ""}`}>
        <span style={{ width: `${width}%` }} />
      </span>
    </>
  );
  if (!onOpen) return <div className="rec-bar">{body}</div>;
  return (
    <Button variant="ghost" className="rec-bar" onClick={onOpen}>
      {body}
    </Button>
  );
}

export function Worklist({
  rows,
  total,
  onOpen,
  onPerson,
}: {
  rows: WorkRow[];
  total: number;
  onOpen: () => void;
  onPerson: (personId: string) => void;
}) {
  if (!rows.length) {
    return <p className="rec-empty">No one is waiting.</p>;
  }
  return (
    <div>
      <ul className="rec-work">
        {rows.map((row) => (
          <li key={row.personId} className={row.waitedDays >= 6 ? "rec-work-overdue" : undefined}>
            <Button variant="ghost" className="rec-work-main" onClick={() => onPerson(row.personId)}>
              <span className="rec-mark" aria-hidden>●</span>
              <span>
                {row.text}
                {row.waitedDays >= 6 ? " · Overdue" : ""}
              </span>
            </Button>
            <span className="rec-chip">{row.waitedDays}d</span>
            <span className="rec-work-actions">
              {row.whatsappHref ? (
                <TextLink href={row.whatsappHref} target="_blank" rel="noreferrer">WhatsApp</TextLink>
              ) : (
                <TextLink onClick={() => onPerson(row.personId)}>WhatsApp</TextLink>
              )}
              <TextLink href={row.openHref}>Open</TextLink>
            </span>
          </li>
        ))}
      </ul>
      {total > rows.length ? (
        <TextLink onClick={onOpen}>See all {total}</TextLink>
      ) : null}
    </div>
  );
}

export function RecSkeleton() {
  return (
    <div className="rec-tiles" aria-busy="true" aria-label="Loading recruitment">
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="rec-tile rec-skeleton" />)}
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="rec-drawer-back" role="presentation" onClick={onClose}>
      <aside
        className="rec-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="rec-drawer-head">
          <h2>{title}</h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <span aria-hidden>×</span>
          </IconButton>
        </header>
        {children}
      </aside>
    </div>
  );
}
