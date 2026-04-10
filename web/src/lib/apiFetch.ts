/**
 * JSON fetch with text-first parse (avoids opaque failures on HTML error bodies)
 * and one optional retry on transient network errors ("Failed to fetch").
 */
export async function fetchJsonWithNetworkRetry<T>(
  url: string,
  init: RequestInit,
  options?: { retries?: number; retryDelayMs?: number }
): Promise<T> {
  const maxAttempts = 1 + (options?.retries ?? 1);
  const delayMs = options?.retryDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let body: unknown = {};
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          throw new Error(res.ok ? "Invalid response from server" : `Server error (${res.status})`);
        }
      }
      if (!res.ok) {
        const errMsg =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: string }).error ?? "")
            : "";
        throw new Error(errMsg || `Request failed (${res.status})`);
      }
      return body as T;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isNetwork =
        e instanceof TypeError ||
        msg === "Failed to fetch" ||
        msg.toLowerCase().includes("networkerror") ||
        msg.toLowerCase().includes("load failed");
      if (attempt < maxAttempts - 1 && isNetwork) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }

  throw lastErr;
}
