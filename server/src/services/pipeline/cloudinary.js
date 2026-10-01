/**
 * Cloudinary signed uploads — server holds credentials, client posts the file.
 */

import crypto from "crypto";

const ALLOWED_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PER_OWNER = 12;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ cloudName: string, apiKey: string, apiSecret: string, folder: string } | null}
 */
export function cloudinaryConfigFromEnv(env = process.env) {
  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  const folder = String(env.CLOUDINARY_FOLDER || "cleva-market").trim() || "cleva-market";
  return { cloudName, apiKey, apiSecret, folder };
}

/**
 * Cloudinary upload signature: sorted key=value joined by &, then SHA-1(secret).
 * @param {Record<string, string | number>} params
 * @param {string} apiSecret
 */
export function signCloudinaryParams(params, apiSecret) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const toSign = pairs.join("&");
  return crypto.createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

/**
 * @param {{ folder?: string, purpose?: string, ownerType?: string, ownerId?: string }} [opts]
 * @param {{ now?: number, env?: NodeJS.ProcessEnv }} [deps]
 */
export function buildSignedUpload(opts = {}, deps = {}) {
  const cfg = cloudinaryConfigFromEnv(deps.env);
  if (!cfg) return { ok: false, error: "Photo uploads are not configured." };
  const timestamp = Math.floor((deps.now ?? Date.now()) / 1000);
  const purpose = String(opts.purpose || "gallery").replace(/[^a-z_]/g, "") || "gallery";
  const folder = `${cfg.folder}/${purpose}`;
  const params = { folder, timestamp };
  const signature = signCloudinaryParams(params, cfg.apiSecret);
  return {
    ok: true,
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    timestamp,
    signature,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    maxBytes: MAX_BYTES,
    allowedFormats: [...ALLOWED_FORMATS],
  };
}

/**
 * @param {string} url
 * @param {string} cloudName
 */
export function isCloudinaryUrl(url, cloudName) {
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") return false;
    const hostOk =
      u.hostname === "res.cloudinary.com" || u.hostname.endsWith(".cloudinary.com");
    if (!hostOk) return false;
    return u.pathname.includes(`/${cloudName}/`);
  } catch {
    return false;
  }
}

/**
 * @param {{ format?: string, bytes?: number, secureUrl?: string, publicId?: string }} input
 * @param {{ cloudName?: string }} [cfg]
 */
export function validateCloudinaryAsset(input, cfg = {}) {
  const publicId = String(input.publicId || "").trim();
  const secureUrl = String(input.secureUrl || "").trim();
  if (!publicId || publicId.length > 240) return { ok: false, error: "Invalid Cloudinary public id." };
  if (!secureUrl) return { ok: false, error: "Secure URL is required." };
  if (cfg.cloudName && !isCloudinaryUrl(secureUrl, cfg.cloudName)) {
    return { ok: false, error: "Image must be uploaded to the configured Cloudinary cloud." };
  }
  const format = String(input.format || "").toLowerCase().replace(/^\./, "");
  if (format && !ALLOWED_FORMATS.has(format)) {
    return { ok: false, error: "Unsupported image format." };
  }
  const bytes = Number(input.bytes);
  if (Number.isFinite(bytes) && bytes > MAX_BYTES) {
    return { ok: false, error: "Image is too large (max 8 MB)." };
  }
  return { ok: true, publicId, secureUrl, format: format || null, bytes: Number.isFinite(bytes) ? bytes : null };
}

export function mediaLimitPerOwner() {
  return MAX_PER_OWNER;
}

/**
 * @param {string} publicId
 * @param {{ env?: NodeJS.ProcessEnv }} [deps]
 */
export function buildDestroySignature(publicId, deps = {}) {
  const cfg = cloudinaryConfigFromEnv(deps.env);
  if (!cfg) return { ok: false, error: "Photo uploads are not configured." };
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  return {
    ok: true,
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    timestamp,
    signature: signCloudinaryParams(params, cfg.apiSecret),
    destroyUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`,
    publicId,
  };
}

export async function destroyCloudinaryAsset(publicId, fetchFn = fetch, deps = {}) {
  const signed = buildDestroySignature(publicId, deps);
  if (!signed.ok) return signed;
  const body = new URLSearchParams({
    public_id: signed.publicId,
    timestamp: String(signed.timestamp),
    api_key: signed.apiKey,
    signature: signed.signature,
  });
  try {
    const res = await fetchFn(signed.destroyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      return { ok: false, error: "Cloudinary delete failed." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cloudinary delete failed." };
  }
}
