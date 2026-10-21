import { API_BASE_URL } from "../api/config";
import { MARKET_AD_CHANNELS, parseSignupSearch } from "./signupAttribution.ts";

const VISITOR_KEY = "cleva.market.visitor";
const SOURCE_KEY = "cleva.market.source";
const ATTR_KEY = "cleva.market.attr";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MarketFirstTouch = {
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  gclid: string;
  fbclid: string;
  landingPath: string;
};

export function marketVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY) || "";
    if (UUID_RE.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function normalizeChannel(raw: string): string {
  const compact = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  if (!compact || compact === "direct" || compact === "market") return "";
  if (compact === "ig" || compact === "insta") return "instagram";
  if (compact === "wa") return "whatsapp";
  if (compact === "fb") return "facebook";
  return compact;
}

/** Keep the campaign code from the link that brought them in. */
export function rememberMarketSource(search = ""): string {
  try {
    const q = parseSignupSearch(search);
    const fromRaw = (q.from || "").trim();
    const fromNorm = normalizeChannel(fromRaw);
    const utm = normalizeChannel(q.utm_source || "");
    const sourceParam = normalizeChannel(q.source || "");
    const channel =
      utm ||
      sourceParam ||
      (fromNorm && fromNorm !== "market" ? fromNorm : "") ||
      (MARKET_AD_CHANNELS.has(fromRaw.toLowerCase()) ? normalizeChannel(fromRaw) : "");
    if (channel) sessionStorage.setItem(SOURCE_KEY, channel.slice(0, 40));
    return sessionStorage.getItem(SOURCE_KEY) || "";
  } catch {
    return "";
  }
}

/** Persist first-touch UTM / click ids so they survive return visits. */
export function rememberMarketAttribution(search = "", landingPath = ""): MarketFirstTouch {
  const empty: MarketFirstTouch = {
    source: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    gclid: "",
    fbclid: "",
    landingPath: "",
  };
  try {
    let prev: MarketFirstTouch = empty;
    try {
      const raw = localStorage.getItem(ATTR_KEY);
      if (raw) prev = { ...empty, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    const q = parseSignupSearch(search);
    const source = rememberMarketSource(search) || prev.source;
    const next: MarketFirstTouch = {
      source,
      utm_source: (q.utm_source || "").trim() || prev.utm_source,
      utm_medium: (q.utm_medium || "").trim() || prev.utm_medium,
      utm_campaign: (q.utm_campaign || "").trim() || prev.utm_campaign,
      gclid: (q.gclid || "").trim() || prev.gclid,
      fbclid: (q.fbclid || "").trim() || prev.fbclid,
      landingPath: landingPath.trim() || prev.landingPath || (typeof window !== "undefined" ? window.location.pathname : ""),
    };
    if (next.utm_source || next.gclid || next.fbclid || next.source || next.landingPath) {
      localStorage.setItem(ATTR_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return empty;
  }
}

export function readMarketAttribution(): MarketFirstTouch {
  try {
    const raw = localStorage.getItem(ATTR_KEY);
    if (!raw) {
      return {
        source: rememberMarketSource(""),
        utm_source: "",
        utm_medium: "",
        utm_campaign: "",
        gclid: "",
        fbclid: "",
        landingPath: "",
      };
    }
    const parsed = JSON.parse(raw) as Partial<MarketFirstTouch>;
    return {
      source: parsed.source || rememberMarketSource("") || "",
      utm_source: parsed.utm_source || "",
      utm_medium: parsed.utm_medium || "",
      utm_campaign: parsed.utm_campaign || "",
      gclid: parsed.gclid || "",
      fbclid: parsed.fbclid || "",
      landingPath: parsed.landingPath || "",
    };
  } catch {
    return {
      source: "",
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      gclid: "",
      fbclid: "",
      landingPath: "",
    };
  }
}

/** Payload fields for POST /api/auth/signup */
export function signupAttributionPayload(search = ""): Record<string, string> {
  const attr = rememberMarketAttribution(search, typeof window !== "undefined" ? window.location.pathname : "");
  const out: Record<string, string> = {
    visitorId: marketVisitorId(),
    source: attr.source || rememberMarketSource(search) || "direct",
  };
  if (attr.utm_source) out.utm_source = attr.utm_source;
  if (attr.utm_medium) out.utm_medium = attr.utm_medium;
  if (attr.utm_campaign) out.utm_campaign = attr.utm_campaign;
  if (attr.gclid) out.gclid = attr.gclid;
  if (attr.fbclid) out.fbclid = attr.fbclid;
  if (attr.landingPath) out.landingPath = attr.landingPath;
  return out;
}

export function recordMarketReach(event: "opened" | "join_started", search = ""): void {
  const attr = rememberMarketAttribution(search, typeof window !== "undefined" ? window.location.pathname : "");
  const source = attr.source || rememberMarketSource(search);
  const day = new Date().toISOString().slice(0, 10);
  const gate = `cleva.market.reach.${event}.${source || "direct"}.${day}`;
  try {
    if (sessionStorage.getItem(gate)) return;
    sessionStorage.setItem(gate, "1");
  } catch {
    /* still send once */
  }
  const visitorId = marketVisitorId();
  void fetch(`${API_BASE_URL}/api/market/reach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, source, visitorId }),
  }).catch(() => {});
}
