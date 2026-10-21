/**
 * Shared market/ad signup attribution helpers.
 * `from=market` is the product path; channels use utm_* or known from= codes.
 */

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

export const ONBOARDING_STAGES = new Set([
  "new",
  "contacted",
  "call_booked",
  "onboarded",
  "active",
  "unreachable",
  "not_a_fit",
]);

export function normalizeAttributionSource(raw) {
  const compact = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40);
  if (!compact || compact === "direct" || compact === "market") return "direct";
  if (compact === "ig" || compact === "insta") return "instagram";
  if (compact === "wa") return "whatsapp";
  if (compact === "fb") return "facebook";
  return compact;
}

/**
 * @param {{ body?: Record<string, unknown>, query?: Record<string, unknown> } | null | undefined} req
 */
export function readSignupQueryish(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const query = req?.query && typeof req.query === "object" ? req.query : {};
  const pick = (key) => {
    const b = body[key];
    const q = query[key];
    if (b != null && String(b).trim()) return String(b).trim();
    if (q != null && String(q).trim()) return String(q).trim();
    return "";
  };
  return {
    from: pick("from").toLowerCase(),
    claim: pick("claim"),
    accountType: pick("accountType").toLowerCase(),
    utmSource: pick("utm_source") || pick("utmSource"),
    utmMedium: pick("utm_medium") || pick("utmMedium"),
    utmCampaign: pick("utm_campaign") || pick("utmCampaign"),
    gclid: pick("gclid"),
    fbclid: pick("fbclid"),
    source: pick("source"),
    landingPath: pick("landingPath") || pick("landing_path"),
    visitorId: pick("visitorId") || pick("visitor_id"),
  };
}

/**
 * True when this signup belongs on the market host (seller / buyer / scout),
 * not the Full Clevafarm workspace product.
 * @param {{ body?: Record<string, unknown>, query?: Record<string, unknown> } | null | undefined} req
 */
export function isAdOrMarketSignup(req) {
  const q = readSignupQueryish(req);
  if (q.from === "market" || q.claim) return true;
  if (q.accountType === "scout" || q.accountType === "buyer" || q.accountType === "farmer") return true;
  if (MARKET_AD_CHANNELS.has(q.from)) return true;
  if (q.utmSource || q.gclid || q.fbclid) return true;
  const src = normalizeAttributionSource(q.source || q.from);
  if (src !== "direct" && MARKET_AD_CHANNELS.has(src)) return true;
  return false;
}

/**
 * Resolve the channel label stored on attempts / people_onboarding.
 * @param {{ body?: Record<string, unknown>, query?: Record<string, unknown> } | null | undefined} req
 */
export function resolveSignupSource(req) {
  const q = readSignupQueryish(req);
  if (q.utmSource) return normalizeAttributionSource(q.utmSource);
  if (q.source) return normalizeAttributionSource(q.source);
  if (q.from && q.from !== "market") return normalizeAttributionSource(q.from);
  if (q.gclid) return "google";
  if (q.fbclid) return "facebook";
  return "direct";
}

/**
 * @param {{ body?: Record<string, unknown>, query?: Record<string, unknown> } | null | undefined} req
 */
export function resolveClickIdKind(req) {
  const q = readSignupQueryish(req);
  if (q.gclid) return "gclid";
  if (q.fbclid) return "fbclid";
  return null;
}

/**
 * @param {{ body?: Record<string, unknown>, query?: Record<string, unknown> } | null | undefined} req
 */
export function attributionFieldsFromReq(req) {
  const q = readSignupQueryish(req);
  return {
    source: resolveSignupSource(req),
    utmSource: q.utmSource || null,
    utmMedium: q.utmMedium || null,
    utmCampaign: q.utmCampaign || null,
    clickIdKind: resolveClickIdKind(req),
    landingPath: q.landingPath || null,
    visitorId: q.visitorId || null,
  };
}

/**
 * Short ad URLs for Meta / Google / WhatsApp.
 * Always include `from=market` so signup stays on seller/buyer/scout even if
 * a channel param is stripped. Channel lives in `utm_source` for attribution.
 */
export function campaignSignupLinks(origin = "https://market.cleva.rw", campaign = "") {
  const base = String(origin || "https://market.cleva.rw").replace(/\/$/, "");
  const camp = String(campaign || "").trim();
  const mk = (source) => {
    let url = `${base}/signup?from=market&utm_source=${encodeURIComponent(source)}`;
    if (camp && camp.toLowerCase() !== "launch") {
      url += `&utm_campaign=${encodeURIComponent(camp)}`;
    }
    return url;
  };
  return [
    { source: "facebook", url: mk("facebook") },
    { source: "instagram", url: mk("instagram") },
    { source: "google", url: mk("google") },
    { source: "whatsapp", url: mk("whatsapp") },
  ];
}
