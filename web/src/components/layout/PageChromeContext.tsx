import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PageChromeState = {
  title: ReactNode | null;
  actions: ReactNode | null;
  tabs: ReactNode | null;
  tabsActions: ReactNode | null;
};

type InternalState = PageChromeState & { owner: string | null };

type PageChromeContextValue = PageChromeState & {
  setChrome: (patch: Partial<PageChromeState>, owner: string) => void;
  /** Clear only if this owner still holds the chrome (avoids wipe races with persistent pages). */
  clearChrome: (owner: string) => void;
};

const EMPTY: PageChromeState = {
  title: null,
  actions: null,
  tabs: null,
  tabsActions: null,
};

const PageChromeContext = createContext<PageChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InternalState>({ ...EMPTY, owner: null });

  const setChrome = useCallback((patch: Partial<PageChromeState>, owner: string) => {
    setState((prev) => ({
      title: patch.title !== undefined ? patch.title : prev.title,
      actions: patch.actions !== undefined ? patch.actions : prev.actions,
      tabs: patch.tabs !== undefined ? patch.tabs : prev.tabs,
      tabsActions: patch.tabsActions !== undefined ? patch.tabsActions : prev.tabsActions,
      owner,
    }));
  }, []);

  const clearChrome = useCallback((owner: string) => {
    setState((prev) => (prev.owner === owner ? { ...EMPTY, owner: null } : prev));
  }, []);

  const value = useMemo(
    () => ({
      title: state.title,
      actions: state.actions,
      tabs: state.tabs,
      tabsActions: state.tabsActions,
      setChrome,
      clearChrome,
    }),
    [state.title, state.actions, state.tabs, state.tabsActions, setChrome, clearChrome],
  );

  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

export function usePageChrome(): PageChromeContextValue {
  const ctx = useContext(PageChromeContext);
  if (!ctx) {
    return {
      ...EMPTY,
      setChrome: () => undefined,
      clearChrome: () => undefined,
    };
  }
  return ctx;
}
