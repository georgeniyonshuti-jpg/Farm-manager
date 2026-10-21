/**
 * Anonymous market-link counts. The raw visitor id is hashed and not stored.
 */

import crypto from "node:crypto";
import { campaignSignupLinks } from "./signupAttribution.js";

const EVENTS = new Set(["opened", "join_started", "account_created"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeReachSource(raw) {
  const compact = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  if (!compact || compact === "direct") return "direct";
  if (compact === "ig" || compact === "insta") return "instagram";
  if (compact === "wa") return "whatsapp";
  if (compact === "fb") return "facebook";
  return compact;
}

export function hashReachVisitor(raw) {
  const id = String(raw || "").trim();
  if (!UUID_RE.test(id)) return null;
  return crypto.createHash("sha256").update(id).digest("hex");
}

export function hashReachAccount(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  return crypto.createHash("sha256").update(`account:${id}`).digest("hex");
}

export function summarizeReach(rows) {
  const blank = () => ({ opened: 0, joinStarted: 0, accounts: 0 });
  const week = blank();
  const bySource = new Map();
  for (const row of rows || []) {
    const n = Number(row.n || 0);
    const key =
      row.eventType === "opened"
        ? "opened"
        : row.eventType === "join_started"
          ? "joinStarted"
          : row.eventType === "account_created"
            ? "accounts"
            : null;
    if (!key) continue;
    week[key] += n;
    const source = row.source || "direct";
    if (!bySource.has(source)) bySource.set(source, blank());
    bySource.get(source)[key] += n;
  }
  const sources = [...bySource.entries()]
    .map(([source, counts]) => ({ source, ...counts }))
    .sort((a, b) => b.opened - a.opened || a.source.localeCompare(b.source));
  return { week, sources };
}

/**
 * @param {Function} dbQuery
 * @param {{ eventType: string, source?: string, visitorId?: string, userId?: string, accountType?: string }} input
 */
export async function recordMarketReach(dbQuery, input) {
  const eventType = String(input.eventType || "");
  if (!EVENTS.has(eventType)) return { ok: false, error: "Unknown event." };
  const visitorHash = hashReachVisitor(input.visitorId) || (eventType === "account_created" ? hashReachAccount(input.userId) : null);
  if (!visitorHash) return { ok: false, error: "Missing visitor." };
  const source = normalizeReachSource(input.source);
  const accountType = ["farmer", "buyer", "scout"].includes(String(input.accountType || ""))
    ? String(input.accountType)
    : null;
  try {
    const r = await dbQuery(
      `INSERT INTO market_reach (event_type, source, visitor_hash, account_type, day)
       VALUES ($1, $2, $3, $4, (timezone('Africa/Kigali', now()))::date)
       ON CONFLICT (visitor_hash, event_type, source, day) DO NOTHING
       RETURNING id`,
      [eventType, source, visitorHash, accountType]
    );
    return { ok: true, recorded: (r.rowCount ?? 0) > 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record visit." };
  }
}

/**
 * @param {Function} dbQuery
 * @param {{ days?: number }} [opts] days window for the period summary (7, 30, or 90). Default 7.
 */
export async function loadMarketReach(dbQuery, opts = {}) {
  const days = [30, 90].includes(Number(opts.days)) ? Number(opts.days) : 7;
  const lookback = days - 1;
  const [periodR, todayR] = await Promise.all([
    dbQuery(
      `SELECT event_type AS "eventType", source, COUNT(*)::int AS n
         FROM market_reach
        WHERE day >= (timezone('Africa/Kigali', now()))::date - $1::int
        GROUP BY event_type, source`,
      [lookback]
    ),
    dbQuery(
      `SELECT COUNT(*)::int AS n
         FROM market_reach
        WHERE event_type = 'opened'
          AND day = (timezone('Africa/Kigali', now()))::date`
    ),
  ]);
  const summary = summarizeReach(periodR.rows);
  return {
    todayOpened: Number(todayR.rows[0]?.n || 0),
    week: summary.week,
    period: summary.week,
    days,
    sources: summary.sources,
    links: campaignSignupLinks("https://market.cleva.rw"),
  };
}
