import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Stacked mobile-first filters — use in page body, not SectionCard headers. */
export function FieldFilterBar({ children, className = "" }: Props) {
  return (
    <div className={`flex w-full flex-col gap-3 ${className}`.trim()}>
      {children}
    </div>
  );
}

type PresetButtonProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
};

export function FieldFilterPreset({ label, active, onClick }: PresetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-[var(--primary-color)] bg-[var(--primary-color)]/10 text-[var(--primary-color)]"
          : "border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--primary-color)]/40",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
