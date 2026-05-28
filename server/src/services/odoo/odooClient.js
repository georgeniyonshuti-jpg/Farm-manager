import xmlrpc from "xmlrpc";
import { mapOdooError } from "./odooHelpers.js";

let cachedUid = null;

function ensureEnv() {
  const ODOO_URL = process.env.ODOO_URL;
  const ODOO_DB = process.env.ODOO_DB;
  const ODOO_USER = process.env.ODOO_USER;
  const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
  const missing = [];
  if (!ODOO_URL) missing.push("ODOO_URL");
  if (!ODOO_DB) missing.push("ODOO_DB");
  if (!ODOO_USER) missing.push("ODOO_USER");
  if (!ODOO_PASSWORD) missing.push("ODOO_PASSWORD");
  if (missing.length) {
    throw new Error(`Missing required Odoo environment variables: ${missing.join(", ")}`);
  }
}

function endpoint(path) {
  const ODOO_URL = process.env.ODOO_URL;
  const base = String(ODOO_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) {
    return `https://${base}${path}`;
  }
  return `${base}${path}`;
}

function callXmlRpc(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (error, value) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    });
  });
}

async function authenticate() {
  ensureEnv();
  const ODOO_DB = process.env.ODOO_DB;
  const ODOO_USER = process.env.ODOO_USER;
  const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
  if (cachedUid != null) return cachedUid;
  const commonClient = xmlrpc.createSecureClient({ url: endpoint("/xmlrpc/2/common") });
  try {
    const uid = await callXmlRpc(commonClient, "authenticate", [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}]);
    if (!uid) {
      throw new Error("Odoo authentication returned an empty uid.");
    }
    cachedUid = uid;
    return uid;
  } catch (error) {
    throw new Error(`Odoo authentication failed: ${mapOdooError(error)}`);
  }
}

/**
 * Execute an authenticated Odoo XML-RPC model call.
 * Uses model endpoint /xmlrpc/2/object and execute_kw.
 * @param {string} model
 * @param {string} method
 * @param {unknown[]} [args]
 * @param {Record<string, unknown>} [kwargs]
 */
export async function execute(model, method, args = [], kwargs = {}) {
  ensureEnv();
  const ODOO_DB = process.env.ODOO_DB;
  const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
  const objectClient = xmlrpc.createSecureClient({ url: endpoint("/xmlrpc/2/object") });
  let uid = await authenticate();
  try {
    return await callXmlRpc(objectClient, "execute_kw", [
      ODOO_DB,
      uid,
      ODOO_PASSWORD,
      model,
      method,
      args,
      kwargs,
    ]);
  } catch (error) {
    // Re-auth once on auth/session-ish failures.
    const msg = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
    if (msg.includes("access denied") || msg.includes("authentication")) {
      cachedUid = null;
      uid = await authenticate();
      try {
        return await callXmlRpc(objectClient, "execute_kw", [
          ODOO_DB,
          uid,
          ODOO_PASSWORD,
          model,
          method,
          args,
          kwargs,
        ]);
      } catch (retryError) {
        throw new Error(`Odoo execute failed after re-auth: ${mapOdooError(retryError)}`);
      }
    }
    throw new Error(`Odoo execute failed: ${mapOdooError(error)}`);
  }
}

/**
 * Used by health checks/tests.
 */
export async function getAuthenticatedUserId() {
  return authenticate();
}
