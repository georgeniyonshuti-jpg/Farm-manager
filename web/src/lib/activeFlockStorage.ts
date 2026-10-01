const STORAGE_PREFIX = "cleva-farm:active-flock:";

export function activeFlockStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug || "default-farm"}`;
}

export function readStoredActiveFlock(slug: string): string | null {
  try {
    const raw = localStorage.getItem(activeFlockStorageKey(slug));
    const id = raw?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function writeStoredActiveFlock(slug: string, flockId: string | null): void {
  try {
    const key = activeFlockStorageKey(slug);
    if (!flockId) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, flockId);
  } catch {
    /* quota / private mode */
  }
}

export type ResolveActiveFlockInput = {
  flockIds: string[];
  urlFlockId?: string | null;
  storedFlockId?: string | null;
  primaryFlockId?: string | null;
  /** When true, return "" if no valid match (manager "all flocks" views). */
  allowEmpty?: boolean;
};

/** Pick active flock: URL > storage > primary > first in list. */
export function resolveActiveFlockId(input: ResolveActiveFlockInput): string {
  const { flockIds, urlFlockId, storedFlockId, primaryFlockId, allowEmpty } = input;
  const valid = new Set(flockIds);

  if (urlFlockId && valid.has(urlFlockId)) return urlFlockId;
  if (storedFlockId && valid.has(storedFlockId)) return storedFlockId;
  if (primaryFlockId && valid.has(primaryFlockId)) return primaryFlockId;
  if (flockIds.length === 1) return flockIds[0];
  if (allowEmpty) return "";
  return flockIds[0] ?? "";
}
