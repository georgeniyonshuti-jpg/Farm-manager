import { API_BASE_URL } from "../api/config";

const OAUTH_STATE_KEY = "cleva_farm_oauth_state";
const OAUTH_REDIRECT_KEY = "cleva_farm_oauth_redirect";
const OAUTH_IDP_KEY = "cleva_farm_oauth_idp";
let oauthNavigateLock = false;

function frontendOrigin(): string {
  if (typeof window === "undefined") return "https://farm.cleva.rw";
  return window.location.origin;
}

export function clevaRedirectUri(): string {
  return `${frontendOrigin()}/auth/cleva/callback`;
}

/** Persist ``idp`` from the URL so redirects to ``/login`` do not drop it. */
export function captureIdpFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search).get("idp");
  if (fromQuery) {
    sessionStorage.setItem(OAUTH_IDP_KEY, fromQuery);
    return fromQuery;
  }
  return sessionStorage.getItem(OAUTH_IDP_KEY);
}

export function clearStoredIdp(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(OAUTH_IDP_KEY);
}

export async function beginClevaLogin(idp?: string | null): Promise<void> {
  if (oauthNavigateLock) return;
  oauthNavigateLock = true;
  const idpFromQuery = idp ?? captureIdpFromLocation();
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/cleva/start`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(idpFromQuery ? { idp: idpFromQuery } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      authorizeUrl?: string;
      state?: string;
      redirectUri?: string;
      error?: string;
    };
    if (!res.ok || !data.authorizeUrl || !data.state) {
      throw new Error(data.error ?? "Cleva login is not available");
    }
    sessionStorage.setItem(OAUTH_STATE_KEY, data.state);
    sessionStorage.setItem(OAUTH_REDIRECT_KEY, data.redirectUri ?? clevaRedirectUri());
    window.location.assign(data.authorizeUrl);
  } catch (err) {
    oauthNavigateLock = false;
    throw err;
  }
}

export async function exchangeClevaCallback(
  code: string,
  state: string
): Promise<{
  token: string;
  user: import("./types").SessionUser;
  farmBootstrap?: import("./farmBootstrap").FarmBootstrap | null;
}> {
  const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const redirectUri = sessionStorage.getItem(OAUTH_REDIRECT_KEY) ?? clevaRedirectUri();
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
  if (!storedState || storedState !== state) {
    throw new Error("OAuth state mismatch. Please try Login with Cleva again.");
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/cleva/exchange`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, redirect_uri: redirectUri, state }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string }).error ?? "Cleva login failed"
    ) as Error & { code?: string };
    err.code = (data as { code?: string }).code;
    throw err;
  }
  clearStoredIdp();
  return data as {
    token: string;
    user: import("./types").SessionUser;
    farmBootstrap?: import("./farmBootstrap").FarmBootstrap | null;
  };
}

export async function fetchClevaSsoStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/cleva/status`);
    const data = (await res.json().catch(() => ({}))) as { enabled?: boolean };
    return Boolean(res.ok && data.enabled);
  } catch {
    return false;
  }
}
