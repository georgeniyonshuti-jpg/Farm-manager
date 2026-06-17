import { clevafarmSecretHeaders } from "./clevafarmSecret.js";

const ERPNEXT_BASE_URL = (process.env.ERPNEXT_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const ERPNEXT_SITE = process.env.ERPNEXT_SITE || "";

function receiveUrl() {
  const base = ERPNEXT_BASE_URL;
  const path = "/api/method/clevafarm_integration.api.webhooks.receive";
  if (ERPNEXT_SITE) {
    return `${base}${path}?site=${encodeURIComponent(ERPNEXT_SITE)}`;
  }
  return `${base}${path}`;
}

/**
 * Build outbound webhook JSON body (exported for tests).
 * @param {string} entityType
 * @param {Record<string, unknown>} payload
 * @param {{ correlationId?: string, outboxId?: string, entityId?: string }} [meta]
 */
export function buildOutboundRequestBody(entityType, payload, meta = {}) {
  const correlationId = meta.correlationId || meta.outboxId || null;
  const event = meta.event || "on_update";
  return {
    entityType,
    event,
    payload,
    correlationId,
    correlation_id: correlationId,
    meta: {
      correlationId,
      outboxId: meta.outboxId || null,
      entityType,
      entityId: meta.entityId || payload?.id || null,
    },
  };
}

/**
 * Push entity payload to ERPNext clevafarm_integration receive webhook.
 * @param {string} entityType
 * @param {Record<string, unknown>} payload
 * @param {{ correlationId?: string, outboxId?: string, entityId?: string }} [meta]
 */
export async function pushEntityToErpnext(entityType, payload, meta = {}) {
  const body = buildOutboundRequestBody(entityType, payload, meta);

  const res = await fetch(receiveUrl(), {
    method: "POST",
    headers: clevafarmSecretHeaders(),
    body: JSON.stringify(body),
  });

  const raw = await res.json().catch(() => ({}));
  const message = raw?.message ?? raw;

  if (res.status === 403) {
    const err = new Error("ERPNext rejected X-ClevaFarm-Secret");
    err.status = 403;
    err.fatal = true;
    throw err;
  }

  if (!res.ok) {
    const msg =
      (typeof message === "string" && message) ||
      message?.error ||
      message?.exc ||
      `ERPNext error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.retryable = res.status >= 500 || res.status === 429;
    throw err;
  }

  const result = typeof message === "object" && message ? message : {};
  return {
    ok: result.ok !== false,
    doctype: result.doctype || null,
    name: result.name || null,
    legacy_id: result.legacy_id || payload?.id || null,
  };
}
