import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { readAuthHeaders } from "../lib/authHeaders";

export type RefOption = { value: string; label: string };

/**
 * Loads active reference options for a category; falls back to `fallback` if the request fails.
 */
export function useReferenceOptions(
  category: string,
  token: string | null | undefined,
  fallback: ReadonlyArray<RefOption>,
): RefOption[] {
  const fbRef = useRef<ReadonlyArray<RefOption>>(fallback);
  fbRef.current = fallback;
  const [options, setOptions] = useState<RefOption[]>(() => [...fallback]);

  useEffect(() => {
    if (!token) {
      setOptions([...fbRef.current]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/reference-options`, {
          headers: readAuthHeaders(token),
        });
        const d = (await r.json()) as { categories?: Record<string, RefOption[]> };
        if (!r.ok || !d.categories?.[category]?.length) {
          if (!cancelled) setOptions([...fbRef.current]);
          return;
        }
        const list = d.categories[category]!;
        if (!cancelled) {
          setOptions(
            list.map((x) => ({
              value: String(x.value),
              label: String(x.label ?? x.value),
            })),
          );
        }
      } catch {
        if (!cancelled) setOptions([...fbRef.current]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, category]);

  return options;
}
