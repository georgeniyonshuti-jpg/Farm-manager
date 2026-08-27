import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  htmlFor?: string;
  help?: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

const controlBase =
  "w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60";

export function Field({ label, htmlFor, help, error, children, className = "" }: FieldProps) {
  return (
    <label className={`block ${className}`} htmlFor={htmlFor}>
      <span className="type-label mb-1.5 block">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-[var(--status-danger)]">{error}</span> : null}
      {!error && help ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{help}</span> : null}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlBase} min-h-[48px] ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlBase} min-h-[48px] ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlBase} min-h-[96px] ${className}`} {...rest} />;
}

export function Checkbox({
  label,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`inline-flex min-h-[48px] items-center gap-3 text-sm text-[var(--text-primary)] ${className}`}>
      <input
        type="checkbox"
        className="h-5 w-5 rounded border-[var(--border-input)] text-[var(--primary-color)] focus:ring-[var(--primary-color)]"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

type SegmentOption = { value: string; label: string; badge?: number };

type SegmentedProps = {
  label?: string;
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
  className?: string;
  /** capsule = POS hub tabs (default); grid = large equal-width form taps */
  variant?: "capsule" | "grid";
  fullWidth?: boolean;
  size?: "sm" | "md";
};

/**
 * POS-matched segmented control (Cleva POS `.cleva-segmented-control` / `.cleva-pill`).
 * Use variant="grid" for large mobile form choices (Full/Low/Empty).
 */
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  className = "",
  variant = "capsule",
  fullWidth = false,
  size = "md",
}: SegmentedProps) {
  if (variant === "grid") {
    return (
      <div className={className}>
        {label ? <p className="type-label mb-2">{label}</p> : null}
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}
          role="radiogroup"
          aria-label={label}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(opt.value)}
                className={`bounce-tap min-h-[48px] rounded-xl border px-3 text-sm font-semibold transition ${
                  active
                    ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                    : "border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className={className}>
      {label ? <p className="type-label mb-2">{label}</p> : null}
      <div
        className={`inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-subtle)] p-[3px] ${
          fullWidth ? "flex w-full" : ""
        }`}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={`bounce-tap inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold transition ${pad} ${
                fullWidth ? "flex-1" : ""
              } ${
                active
                  ? "border-[color-mix(in_srgb,var(--primary-color)_28%,var(--border-color))] bg-[var(--surface-card)] text-[var(--primary-color-dark)] shadow-sm"
                  : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-card)_70%,transparent)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {opt.label}
              {opt.badge != null && opt.badge > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                    active ? "bg-[var(--primary-color)] text-white" : "bg-[var(--border-color)] text-[var(--text-secondary)]"
                  }`}
                >
                  {opt.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
