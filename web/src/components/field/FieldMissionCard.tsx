import type { ReactNode } from "react";
import { Card, StatusPill } from "../ui";

type Props = {
  statusTitle: string;
  statusSubtitle?: string;
  flockLabel?: string | null;
  urgencyTone?: "success" | "warning" | "danger" | "neutral";
  urgencyLabel?: string;
  primaryAction: ReactNode;
};

/** Laborer home hero — one status message and one primary CTA. */
export function FieldMissionCard({
  statusTitle,
  statusSubtitle,
  flockLabel,
  urgencyTone = "neutral",
  urgencyLabel,
  primaryAction,
}: Props) {
  return (
    <Card level="elevated" className="!p-5 space-y-4">
      <div className="space-y-2">
        {urgencyLabel ? (
          <StatusPill tone={urgencyTone}>{urgencyLabel}</StatusPill>
        ) : null}
        <p className="type-h2 text-[var(--text-primary)]">{statusTitle}</p>
        {statusSubtitle ? (
          <p className="type-caption text-[var(--text-muted)]">{statusSubtitle}</p>
        ) : null}
        {flockLabel ? (
          <p className="type-label text-[var(--text-secondary)]">{flockLabel}</p>
        ) : null}
      </div>
      <div>{primaryAction}</div>
    </Card>
  );
}
