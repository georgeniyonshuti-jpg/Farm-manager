import type { ApiHealthStatus } from "../hooks/useApiHealthStatus";

type Props = {
  apiStatus?: ApiHealthStatus;
};

/** Minimal boot splash — no artificial step delays. Parent hides when bootstrapped. */
export function AppLoadingScreen({ apiStatus = "checking" }: Props) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[linear-gradient(135deg,#f0fdf4_0%,#ecfdf5_50%,#f0f9ff_100%)]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-[min(340px,92vw)] rounded-[20px] bg-white px-10 py-10 text-center shadow-[0_8px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]">
        <div
          className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#166534_0%,#16a34a_100%)] text-4xl shadow-[0_4px_16px_rgba(22,101,52,0.25)]"
          aria-hidden
        >
          🐔
        </div>
        <p className="text-[22px] font-extrabold tracking-tight text-gray-900">Farm Manager</p>
        <p className="mt-1 text-sm text-gray-500">Clevafarm</p>
        <div className="mx-auto mt-6 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[linear-gradient(90deg,#16a34a,#4ade80)]" />
        </div>
        <p className="mt-4 min-h-[20px] text-sm text-gray-500">Loading workspace…</p>
        {apiStatus === "down" ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Having trouble reaching the server. Retrying…
          </p>
        ) : null}
      </div>
    </div>
  );
}
