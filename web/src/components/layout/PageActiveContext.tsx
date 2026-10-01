import { createContext, useContext, type ReactNode } from "react";

/** Whether the enclosing PersistentPageSlot (or Outlet page) is the active route. */
const PageActiveContext = createContext(true);

export function PageActiveProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <PageActiveContext.Provider value={active}>{children}</PageActiveContext.Provider>;
}

export function usePageActive(): boolean {
  return useContext(PageActiveContext);
}
