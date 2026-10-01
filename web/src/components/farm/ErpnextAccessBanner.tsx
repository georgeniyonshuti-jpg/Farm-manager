import { ERPNEXT_ACCESS_MESSAGE, useFarmCapabilities } from "../../hooks/useFarmCapabilities";

export function ErpnextAccessBanner() {
  const { erpnextAccess, hasBootstrap } = useFarmCapabilities();
  if (!hasBootstrap || erpnextAccess) return null;
  return (
    <div
      className="bg-amber-500/10 px-shell-x py-2 text-center text-xs text-amber-900 dark:text-amber-100"
      role="status"
    >
      {ERPNEXT_ACCESS_MESSAGE}
    </div>
  );
}
