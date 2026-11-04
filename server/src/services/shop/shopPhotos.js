/**
 * Butcher shop item photos, kept in Postgres (shop_product_photos).
 * The desk sends a resized image as base64; customers load it from
 * /api/market/shop/photos/:id.
 */

export const SHOP_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const SHOP_PHOTO_PATH = "/api/market/shop/photos/";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const PHOTO_URL_RE = new RegExp(`^/api/market/shop/photos/${UUID}$`, "i");

function bad(error, status = 400) {
  return { ok: false, status, error };
}

/** Recognise the image from its first bytes, so the declared type cannot lie. */
export function sniffImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** @param {{ dataBase64?: unknown }} body */
export function photoFromBody(body) {
  let raw = String(body?.dataBase64 ?? "");
  const comma = raw.startsWith("data:") ? raw.indexOf(",") : -1;
  if (comma >= 0) raw = raw.slice(comma + 1);
  if (!raw) return bad("Choose a photo.");
  if (raw.length > Math.ceil((SHOP_PHOTO_MAX_BYTES * 4) / 3) + 8 || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    return bad("The photo is too large. Use one under 2 MB.");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 0) return bad("Choose a photo.");
  if (buf.length > SHOP_PHOTO_MAX_BYTES) return bad("The photo is too large. Use one under 2 MB.");
  const contentType = sniffImageType(buf);
  if (!contentType) return bad("Use a JPG, PNG or WebP photo.");
  return { ok: true, contentType, bytes: buf };
}

/** Photo links an item may hold: one of ours, or any https address. */
export function isAllowedPhotoUrl(url) {
  if (PHOTO_URL_RE.test(url)) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function saveShopPhoto(dbQuery, body, actor) {
  const p = photoFromBody(body);
  if (!p.ok) return p;
  try {
    const r = await dbQuery(
      `INSERT INTO shop_product_photos (content_type, bytes, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [p.contentType, p.bytes, p.bytes.length, actor?.userId || null]
    );
    const id = r.rows[0].id;
    return { ok: true, photoUrl: `${SHOP_PHOTO_PATH}${id}` };
  } catch (e) {
    if (String(e?.code) === "42P01") {
      return bad("The photo table is not in the database yet. Run migration 097 after a backup.", 503);
    }
    return bad(e instanceof Error ? e.message : "Could not save the photo.", 500);
  }
}

export async function loadShopPhoto(dbQuery, id) {
  if (!UUID_RE.test(String(id || ""))) return null;
  const r = await dbQuery(`SELECT content_type, bytes FROM shop_product_photos WHERE id = $1`, [id]);
  const row = r.rows[0];
  return row ? { contentType: row.content_type, bytes: row.bytes } : null;
}
