import type { ReactNode } from "react";

type RowProps = { className?: string };

export function SkeletonRow({ className = "h-14" }: RowProps) {
  return <div className={`skeleton-shimmer rounded-xl ${className}`} />;
}

type ListProps = { rows?: number };

export function SkeletonList({ rows = 4 }: ListProps) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

type Props = {
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({ message, onRetry, retryLabel = "Try again" }: Props) {
  return (
    <div
      className="rounded-lg border border-[var(--status-danger)]/25 bg-[var(--status-danger-soft)] px-3 py-3 text-sm text-[var(--status-danger)]"
      role="alert"
    >
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-2 font-semibold underline opacity-90 hover:opacity-100"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
