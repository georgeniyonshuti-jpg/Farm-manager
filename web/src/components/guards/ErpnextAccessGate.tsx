import type { ReactNode } from "react";
import { AccessDeniedRedirect } from "../../routes/AccessDeniedRedirect";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";

export function ErpnextAccessGate({ children }: { children: ReactNode }) {
  const { erpnextAccess, hasBootstrap } = useFarmCapabilities();
  if (hasBootstrap && !erpnextAccess) {
    return <AccessDeniedRedirect />;
  }
  return <>{children}</>;
}
