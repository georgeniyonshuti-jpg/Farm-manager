import { API_BASE_URL } from "../api/config";

const ERPNEXT_OAUTH_URL =
  import.meta.env.VITE_ERPNEXT_OAUTH_URL ||
  "https://erp.clevacredit.com/api/method/frappe.integrations.oauth2.authorize";
const CLIENT_ID = import.meta.env.VITE_ERPNEXT_OAUTH_CLIENT_ID || "clevafarm";

function redirectUri(): string {
  if (typeof window === "undefined") return "https://farm.clevacredit.com/auth/erpnext/callback";
  return `${window.location.origin}/auth/erpnext/callback`;
}

export function redirectToERPNextLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: "openid profile email",
    state,
  });

  window.location.href = `${ERPNEXT_OAUTH_URL}?${params}`;
}

export async function handleOAuthCallback(code: string, state: string, farmToken: string | null) {
  const storedState = sessionStorage.getItem("oauth_state");
  if (state !== storedState) throw new Error("OAuth state mismatch");
  sessionStorage.removeItem("oauth_state");

  const res = await fetch(`${API_BASE_URL}/api/erpnext/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(farmToken ? { Authorization: `Bearer ${farmToken}` } : {}),
    },
    body: JSON.stringify({ code, redirect_uri: redirectUri() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "OAuth token exchange failed");
  return data;
}

export { redirectUri as erpnextOAuthRedirectUri };
