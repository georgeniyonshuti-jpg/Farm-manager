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
 * Quiet capsule for filters and mutually exclusive choices (Cleva POS–aligned).
 * Selected state must read at a glance — soft primary fill, not white-on-subtle.
 * Use variant="grid" for large mobile form taps (Full/Low/Empty).
 * Use PageTabs for distinct page jobs in AppTopBar.
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

  const pad = size === "sm" ? "px-3 py-1.5 text-xs leading-4" : "px-3.5 py-2 text-sm leading-5";
  /** Only stretch when explicitly fullWidth — auto-equalizing squeezes long labels into the chip. */
  const stretch = fullWidth;

  return (
    <div className={className}>
      {label ? <p className="type-label mb-2">{label}</p> : null}
      <div
        className={`inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--surface-subtle)_70%,var(--border-color)_30%)] p-1 ${
          stretch ? "flex w-full" : ""
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
              className={`bounce-tap box-border inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-semibold transition ${pad} ${
                stretch ? "min-w-0 flex-1" : "shrink-0"
              } ${
                active
                  ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                  : "border-transparent bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {opt.label}
              {opt.badge != null && opt.badge > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                    active
                      ? "bg-[var(--primary-color)] text-white"
                      : "bg-[var(--border-color)] text-[var(--text-secondary)]"
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
