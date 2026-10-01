import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleUser } from "lucide-react";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreAccountMenu({
  locale,
  signupTo,
}: {
  locale: StoreLocale;
  signupTo: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const aria = `${t("signIn")} / ${t("createAccount")}`;

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
    <div className="store-account" ref={rootRef}>
      <button
        type="button"
        className="store-account-btn"
        aria-label={aria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleUser size={20} strokeWidth={2.1} aria-hidden />
      </button>
      {open ? (
        <ul id={menuId} className="store-account-menu" role="menu">
          <li role="none">
            <Link to="/login" role="menuitem" className="store-account-item" onClick={() => setOpen(false)}>
              {t("signIn")}
            </Link>
          </li>
          <li role="none">
            <Link to={signupTo} role="menuitem" className="store-account-item" onClick={() => setOpen(false)}>
              {t("createAccount")}
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
