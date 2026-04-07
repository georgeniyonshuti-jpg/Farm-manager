import { useCallback } from "react";
import { useToast } from "../components/Toast";
import { API_BASE_URL } from "./config";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

// PROD-FIX: global fetch wrapper with uniform error-to-toast behavior
export function useApiFetch() {
  const { showToast } = useToast();
  return useCallback(
    async <T,>(path: string, init?: RequestInit, errorPrefix?: string): Promise<T> => {
      try {
        return await apiFetchJson<T>(path, init);
      } catch (e) {
        const base = e instanceof Error ? e.message : "Request failed";
        const msg = errorPrefix ? `${errorPrefix}: ${base}` : base;
        showToast("error", msg);
        throw new Error(msg);
      }
    },
    [showToast]
  );
}
