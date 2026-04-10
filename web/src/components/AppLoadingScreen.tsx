export function AppLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-4">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--border-color)] bg-white p-8 text-center shadow-[var(--shadow-soft)]">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--primary-gradient)] shadow-md">
          <span className="relative inline-flex h-9 w-9 items-center justify-center">
            <span className="absolute inline-flex h-9 w-9 animate-ping rounded-full bg-white/35" />
            <span className="inline-flex h-5 w-5 rounded-full bg-white" />
          </span>
        </div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Farm Manager</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Loading your workspace...</p>
        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-[var(--primary-color-soft)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--primary-color)]" />
        </div>
      </div>
    </div>
  );
}
