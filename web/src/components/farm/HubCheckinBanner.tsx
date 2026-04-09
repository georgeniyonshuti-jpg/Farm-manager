export type HubCheckinBannerVariant = "loading" | "error" | "warn" | "ok";

type Props = {
  variant: HubCheckinBannerVariant;
  message: string;
};

const iconWrap = "flex h-9 w-9 shrink-0 items-center justify-center text-current";

function StatusIcon({ variant }: { variant: HubCheckinBannerVariant }) {
  if (variant === "loading") {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <span className="hub-checkin-spinner" aria-hidden />
      </div>
    );
  }
  if (variant === "error") {
    return (
      <span className={`${iconWrap} rounded-full bg-red-100 text-red-700`} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (variant === "warn") {
    return (
      <span className={`${iconWrap} rounded-full bg-amber-100 text-amber-800`} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`${iconWrap} rounded-full bg-emerald-100 text-emerald-800`} aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function borderClass(v: HubCheckinBannerVariant): string {
  switch (v) {
    case "loading":
      return "border-l-amber-400";
    case "error":
      return "border-l-red-500";
    case "warn":
      return "border-l-amber-500";
    case "ok":
      return "border-l-[#1D9E75]";
    default:
      return "border-l-neutral-300";
  }
}

/** Status card for aggregate round check-in message on laborer / vet hubs. */
export function HubCheckinBanner({ variant, message }: Props) {
  const b = borderClass(variant);

  return (
    <div
      className={`w-full rounded-lg border border-neutral-200/90 bg-white p-3 shadow-sm border-l-4 ${b}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <StatusIcon variant={variant} />
        <div className="min-w-0 flex-1">
          {variant === "loading" ? (
            <>
              <span className="sr-only">{message}</span>
              <div className="space-y-2 pt-0.5" aria-hidden>
                <div className="skeleton-shimmer h-3 w-full rounded" />
                <div className="skeleton-shimmer h-3 w-4/5 max-w-[280px] rounded" />
              </div>
            </>
          ) : (
            <p className="text-sm font-medium leading-snug text-neutral-900">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
