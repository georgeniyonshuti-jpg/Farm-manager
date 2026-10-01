import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Sync a small set of table filter keys to the URL query string
 * so filtered views are bookmarkable / shareable.
 */
export function useTableQueryParams<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const values = useMemo(() => {
    const next = { ...defaultsRef.current };
    for (const key of Object.keys(defaultsRef.current) as (keyof T)[]) {
      const raw = params.get(String(key));
      if (raw != null && raw !== "") next[key] = raw as T[keyof T];
    }
    return next;
  }, [params]);

  const setValue = useCallback(
    (key: keyof T, value: string) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          const def = defaultsRef.current[key];
          if (!value || value === def) n.delete(String(key));
          else n.set(String(key), value);
          return n;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const setMany = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch) as [keyof T, string | undefined][]) {
            const def = defaultsRef.current[key];
            if (value == null || value === "" || value === def) n.delete(String(key));
            else n.set(String(key), value);
          }
          return n;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return { values, setValue, setMany };
}
