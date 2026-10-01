import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StoreLocale } from "../../lib/publicStoreCopy";

function FlagEn() {
  return (
    <svg viewBox="0 0 60 30" className="store-locale-flag" aria-hidden>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="10" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" strokeWidth="6" />
      <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="16" />
      <path d="M30 0 V30 M0 15 H60" stroke="#C8102E" strokeWidth="10" />
    </svg>
  );
}

function FlagRw() {
  return (
    <svg viewBox="0 0 60 40" className="store-locale-flag" aria-hidden>
      <rect width="60" height="20" fill="#00A1DE" />
      <rect y="20" width="60" height="8" fill="#FAD201" />
      <rect y="28" width="60" height="12" fill="#20603D" />
      <g transform="translate(46 10)" fill="#E5BE01">
        <circle r="3.2" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="-0.45"
            y="-8.2"
            width="0.9"
            height="3.2"
            transform={`rotate(${i * 30})`}
          />
        ))}
      </g>
    </svg>
  );
}

const OPTIONS: Array<{ id: StoreLocale; label: string; Flag: typeof FlagEn }> = [
  { id: "en", label: "EN", Flag: FlagEn },
  { id: "rw", label: "RW", Flag: FlagRw },
];

export function StoreLocaleSelect({
  locale,
  onChange,
}: {
  locale: StoreLocale;
  onChange: (locale: StoreLocale) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = OPTIONS.find((o) => o.id === locale) || OPTIONS[0];
  const Flag = current.Flag;
  const aria = locale === "rw" ? "Ururimi" : "Language";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="store-locale" ref={rootRef}>
      <button
        type="button"
        className="store-locale-btn"
        aria-label={aria}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <Flag />
        <span>{current.label}</span>
        <ChevronDown size={14} strokeWidth={2.4} aria-hidden />
      </button>
      {open ? (
        <ul id={menuId} className="store-locale-menu" role="listbox" aria-label={aria}>
          {OPTIONS.map((opt) => {
            const OptFlag = opt.Flag;
            return (
              <li key={opt.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.id === locale}
                  className="store-locale-option"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                >
                  <OptFlag />
                  <span>{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
