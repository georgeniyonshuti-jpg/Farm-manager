import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SessionUser, UserRole } from "../../auth/types";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useTheme } from "../../context/ThemeContext";
import { readDensity, writeDensity, type AppDensity } from "../../lib/density";

export function initialsFromDisplayName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0];
    return w.slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function avatarStyle(role: UserRole): CSSProperties {
  switch (role) {
    case "laborer":
    case "dispatcher":
      return { background: "var(--role-laborer)" };
    case "vet":
    case "vet_manager":
      return { background: "var(--role-vet)" };
    case "manager":
    case "company_admin":
      return { background: "var(--role-manager)" };
    default:
      return { background: "var(--text-muted)" };
  }
}

export function avatarClasses(_role: UserRole): string {
  return "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm";
}

function rolePillStyle(role: UserRole): CSSProperties {
  switch (role) {
    case "laborer":
    case "dispatcher":
      return { background: "var(--role-laborer-bg)", color: "var(--role-laborer-text)" };
    case "vet":
    case "vet_manager":
      return { background: "var(--role-vet-bg)", color: "var(--role-vet-text)" };
    case "manager":
    case "company_admin":
      return { background: "var(--role-manager-bg)", color: "var(--role-manager-text)" };
    default:
      return { background: "var(--surface-subtle)", color: "var(--text-secondary)" };
  }
}

function rolePillClasses(_role: UserRole): string {
  return "rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-tight";
}

type UserMenuChipProps = {
  user: SessionUser;
  roleBadge: string;
  onLogout: () => void;
  compactOnMobile?: boolean;
  includeThemeToggle?: boolean;
  includeDensityToggle?: boolean;
  showRolePill?: boolean;
  showChevron?: boolean;
  detailLines?: string[];
  avatarTone?: "role" | "store";
};

export function UserMenuChip({
  user,
  roleBadge,
  onLogout,
  compactOnMobile = false,
  includeThemeToggle = false,
  includeDensityToggle = false,
  showRolePill = true,
  showChevron = false,
  detailLines = [],
  avatarTone = "role",
}: UserMenuChipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const initials = useMemo(() => initialsFromDisplayName(user.displayName), [user.displayName]);
  const signOut = useLaborerT("Sign out");
  const lightMode = useLaborerT("Light mode");
  const darkMode = useLaborerT("Dark mode");
  const { theme, toggleTheme } = useTheme();
  const [density, setDensity] = useState<AppDensity>(() =>
    typeof document !== "undefined" ? readDensity() : "comfortable",
  );

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handle);
    }
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    const sync = () => setDensity(readDensity());
    window.addEventListener("cleva-density", sync);
    return () => window.removeEventListener("cleva-density", sync);
  }, []);

  const hideNameBlock = compactOnMobile;
  const chevronVisible = showChevron || !compactOnMobile;

  return (
    <div className="relative min-w-0" ref={wrapRef}>
      <button
        type="button"
        className="bounce-tap flex max-w-full min-h-[44px] items-center gap-1.5 rounded-control border border-transparent px-1 py-1 text-left hover:bg-black/[0.03] md:min-h-0 md:gap-2 md:px-2 md:py-1"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compactOnMobile && !showChevron ? user.displayName : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={avatarClasses(user.role)}
          style={avatarTone === "store" ? { background: "var(--store-ember)" } : avatarStyle(user.role)}
        >
          {initials}
        </span>
        <div className={`min-w-0 flex-1 text-left ${hideNameBlock ? "hidden md:block" : ""}`}>
          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{user.displayName}</p>
          {showRolePill &&
          roleBadge.trim().toLowerCase() !== user.displayName.trim().toLowerCase() ? (
            <p className="mt-0.5">
              <span className={rolePillClasses(user.role)} style={rolePillStyle(user.role)}>
                {roleBadge}
              </span>
            </p>
          ) : null}
        </div>
        {chevronVisible ? (
          <span
            className={`text-[var(--text-muted)] ${showChevron ? "inline" : "hidden md:inline"}`}
            aria-hidden
          >
            ▾
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[12.5rem] rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] py-1 shadow-elevated"
          role="menu"
        >
          <div className="border-b border-[var(--border-color)] px-3 py-2">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.displayName}</p>
            {roleBadge.trim() &&
            roleBadge.trim().toLowerCase() !== user.displayName.trim().toLowerCase() ? (
              <p className="truncate text-xs text-[var(--text-muted)]">{roleBadge}</p>
            ) : null}
            {detailLines.map((line) => (
              <p key={line} className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                {line}
              </p>
            ))}
          </div>
          {includeThemeToggle ? (
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
              onClick={() => {
                toggleTheme();
                setOpen(false);
              }}
            >
              {theme === "dark" ? lightMode : darkMode}
            </button>
          ) : null}
          {includeDensityToggle ? (
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
              onClick={() => {
                const next = density === "compact" ? "comfortable" : "compact";
                writeDensity(next);
                setDensity(next);
                setOpen(false);
              }}
            >
              {density === "compact" ? "Comfortable density" : "Compact density"}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            {signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}
