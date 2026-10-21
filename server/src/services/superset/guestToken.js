/**
 * Mint Apache Superset guest tokens for embedded market dashboards.
 * Uses SUPERSET_URL + SUPERSET_USERNAME/PASSWORD (or SUPERSET_ACCESS_TOKEN).
 * Superset 4.x requires CSRF + session cookie on /security/guest_token/.
 */

function trimBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

export function isSupersetGuestConfigured() {
  const base = trimBase(process.env.SUPERSET_URL || process.env.MARKET_INSIGHTS_SUPERSET_URL || "");
  if (!base) return false;
  if (String(process.env.SUPERSET_ACCESS_TOKEN || "").trim()) return true;
  return Boolean(
    String(process.env.SUPERSET_USERNAME || "").trim() &&
      String(process.env.SUPERSET_PASSWORD || "").trim()
  );
}

export function getSupersetPublicUrl() {
  return trimBase(
    process.env.MARKET_INSIGHTS_SUPERSET_URL ||
      process.env.SUPERSET_URL ||
      process.env.VITE_SUPERSET_URL ||
      ""
  );
}

function cookieHeaderFromResponse(res) {
  const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
  const list = typeof getSetCookie === "function" ? getSetCookie() : [];
  const single = res.headers.get("set-cookie");
  const parts = [...list, ...(single ? [single] : [])]
    .filter(Boolean)
    .map((c) => String(c).split(";")[0].trim())
    .filter(Boolean);
  return [...new Set(parts)].join("; ");
}

/**
 * @returns {Promise<{ accessToken: string, csrf: string, cookies: string }>}
 */
async function loginSession() {
  const base = trimBase(process.env.SUPERSET_URL || process.env.MARKET_INSIGHTS_SUPERSET_URL);
  const existing = String(process.env.SUPERSET_ACCESS_TOKEN || "").trim();
  let accessToken = existing;
  let cookies = "";

  if (!accessToken) {
    const username = String(process.env.SUPERSET_USERNAME || "").trim();
    const password = String(process.env.SUPERSET_PASSWORD || "").trim();
    if (!base || !username || !password) {
      const err = new Error("Superset credentials are not configured.");
      err.code = "superset_credentials_missing";
      err.status = 503;
      throw err;
    }

    const res = await fetch(`${base}/api/v1/security/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username,
        password,
        provider: "db",
        refresh: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    accessToken = body?.access_token || body?.result?.access_token;
    if (!res.ok || !accessToken) {
      const err = new Error(body?.message || body?.error || "Superset login failed");
      err.status = 502;
      err.code = "superset_login_failed";
      throw err;
    }
    cookies = cookieHeaderFromResponse(res);
  }

  const csrfRes = await fetch(`${base}/api/v1/security/csrf_token/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrf = String(csrfBody?.result || csrfBody?.csrf_token || "").trim();
  const csrfCookies = cookieHeaderFromResponse(csrfRes);
  const merged = [cookies, csrfCookies].filter(Boolean).join("; ");

  return { accessToken: String(accessToken), csrf, cookies: merged };
}

/**
 * @param {{
 *   dashboardUuid: string,
 *   username?: string,
 *   rls?: Array<{ clause: string, dataset?: number }>,
 *   ttlSeconds?: number,
 * }} opts
 */
export async function mintSupersetGuestToken(opts) {
  const base = trimBase(process.env.SUPERSET_URL || process.env.MARKET_INSIGHTS_SUPERSET_URL);
  if (!base) {
    const err = new Error("SUPERSET_URL is not configured.");
    err.code = "superset_url_missing";
    err.status = 503;
    throw err;
  }
  const dashboardUuid = String(opts.dashboardUuid || "").trim();
  if (!dashboardUuid) {
    const err = new Error("dashboardUuid is required.");
    err.code = "dashboard_uuid_required";
    err.status = 400;
    throw err;
  }

  const session = await loginSession();
  const payload = {
    user: {
      username: opts.username || "farm-market-embed",
      first_name: "Market",
      last_name: "Analytics",
    },
    resources: [{ type: "dashboard", id: dashboardUuid }],
    rls: Array.isArray(opts.rls) ? opts.rls : [],
  };

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${session.accessToken}`,
    Referer: `${base}/`,
  };
  if (session.csrf) headers["X-CSRFToken"] = session.csrf;
  if (session.cookies) headers.Cookie = session.cookies;

  const res = await fetch(`${base}/api/v1/security/guest_token/`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  const token = body?.token || body?.result?.token || body?.guest_token;
  if (!res.ok || !token) {
    const detail =
      body?.message ||
      body?.error ||
      body?.errors?.[0]?.message ||
      `Superset guest token failed (${res.status})`;
    const err = new Error(detail);
    err.status = res.status >= 400 && res.status < 500 ? 503 : 502;
    err.code = "superset_guest_token_failed";
    throw err;
  }

  return {
    token: String(token),
    supersetUrl: getSupersetPublicUrl() || base,
    dashboardUuid,
    ttlSeconds: opts.ttlSeconds ?? 300,
  };
}
