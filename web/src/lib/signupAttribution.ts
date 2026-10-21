/** Shared market/ad signup detection (mirrors server signupAttribution.js). */

export const MARKET_AD_CHANNELS = new Set([
  "facebook",
  "instagram",
  "whatsapp",
  "google",
  "ig",
  "insta",
  "wa",
  "fb",
]);

export type SignupQueryish = {
  from?: string | null;
  claim?: string | null;
  accountType?: string | null;
  utm_source?: string | null;
  utmSource?: string | null;
  utm_medium?: string | null;
  utmMedium?: string | null;
  utm_campaign?: string | null;
  utmCampaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  source?: string | null;
};

function pick(q: SignupQueryish, ...keys: (keyof SignupQueryish)[]): string {
  for (const key of keys) {
    const v = q[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export function parseSignupSearch(search = ""): SignupQueryish {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  const get = (k: string) => p.get(k);
  return {
    from: get("from"),
    claim: get("claim"),
    accountType: get("accountType"),
    utm_source: get("utm_source"),
    utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    gclid: get("gclid"),
    fbclid: get("fbclid"),
    source: get("source"),
  };
}

/** True when signup is for market seller/buyer/scout, not Full Clevafarm workspace. */
export function isAdOrMarketSignup(q: SignupQueryish): boolean {
  const from = pick(q, "from").toLowerCase();
  const claim = pick(q, "claim");
  const accountType = pick(q, "accountType").toLowerCase();
  const utmSource = pick(q, "utm_source", "utmSource").toLowerCase();
  const gclid = pick(q, "gclid");
  const fbclid = pick(q, "fbclid");
  const source = pick(q, "source").toLowerCase();

  if (from === "market" || claim) return true;
  if (accountType === "scout" || accountType === "buyer" || accountType === "farmer") return true;
  if (MARKET_AD_CHANNELS.has(from)) return true;
  if (utmSource || gclid || fbclid) return true;
  if (source && MARKET_AD_CHANNELS.has(source)) return true;
  return false;
}

export function isAdOrMarketSignupSearch(search: string): boolean {
  return isAdOrMarketSignup(parseSignupSearch(search));
}
