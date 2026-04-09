import dns from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";

/** Match previous server/migrate behavior — still help dual-stack ordering. */
dns.setDefaultResultOrder("ipv4first");

/**
 * @param {string} urlString
 * @returns {{ user: string, password: string, host: string, port: number, database: string }}
 */
export function parsePostgresUrl(urlString) {
  const u = new URL(urlString.replace(/^postgres(ql)?:/i, "http:"));
  let database = u.pathname.replace(/^\//, "");
  if (database.includes("?")) database = database.split("?")[0];
  return {
    user: decodeURIComponent(u.username || ""),
    password: decodeURIComponent(u.password || ""),
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: database || "postgres",
  };
}

/**
 * @param {string} host
 * @returns {string} IPv4 address or IPv4 literal
 */
export function resolveIpv4HostSync(host) {
  const kind = net.isIP(host);
  if (kind === 4) return host;
  if (kind === 6) {
    throw new Error(
      "[db] DATABASE_URL uses an IPv6 host; use the DB hostname (A record) or Render private DB URL.",
    );
  }
  return dns.lookupSync(host, { family: 4 }).address;
}

/**
 * @param {string} databaseUrl
 * @returns {object} config for `pg.Pool` / `pg.Client` (no `connectionString`)
 */
export function pgPoolConfigFromDatabaseUrl(databaseUrl) {
  const p = parsePostgresUrl(databaseUrl);
  const host = resolveIpv4HostSync(p.host);

  return {
    host,
    port: p.port,
    user: p.user,
    password: p.password,
    database: p.database,
    ssl: { rejectUnauthorized: false },
  };
}

/**
 * Async variant for migrations (non-blocking lookup).
 * @param {string} databaseUrl
 */
export async function pgClientConfigFromDatabaseUrlAsync(databaseUrl) {
  const p = parsePostgresUrl(databaseUrl);
  const kind = net.isIP(p.host);
  let host = p.host;
  if (kind === 4) {
    host = p.host;
  } else if (kind === 6) {
    throw new Error(
      "[db] DATABASE_URL uses an IPv6 host; use the DB hostname (A record) or Render private DB URL.",
    );
  } else {
    const r = await lookup(p.host, { family: 4 });
    host = r.address;
  }

  return {
    host,
    port: p.port,
    user: p.user,
    password: p.password,
    database: p.database,
    ssl: { rejectUnauthorized: false },
  };
}
