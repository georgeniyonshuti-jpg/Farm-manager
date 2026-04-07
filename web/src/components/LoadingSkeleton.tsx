type RowProps = { className?: string };

export function SkeletonRow({ className = "h-14" }: RowProps) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200 ${className}`} />;
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
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-2 font-semibold text-red-900 underline hover:text-red-950"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
