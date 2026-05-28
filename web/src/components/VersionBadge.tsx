import { useAuth } from "../auth/AuthContext";

export function VersionBadge() {
  const { user } = useAuth();
  if (!user) return null;

  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  return (
    <div className="fixed bottom-2 left-2 z-50 rounded bg-neutral-900/40 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
      v{version}
    </div>
  );
}
