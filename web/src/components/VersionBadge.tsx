import { useAuth } from "../auth/AuthContext";

export function VersionBadge() {
  const { user } = useAuth();
  if (user?.role !== "superuser") return null;

  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  return (
    <div className="fixed bottom-3 left-3 z-50 rounded-full bg-neutral-900/70 px-2 py-1 text-[11px] font-medium text-white">
      v{version}
    </div>
  );
}
