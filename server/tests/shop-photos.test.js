import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createShopDeskRouter } from "../src/routes/shop.routes.js";
import { createShopPublicRouter } from "../src/routes/shopPublic.routes.js";
import {
  SHOP_PHOTO_MAX_BYTES,
  isAllowedPhotoUrl,
  loadShopPhoto,
  photoFromBody,
  saveShopPhoto,
  sniffImageType,
} from "../src/services/shop/shopPhotos.js";
import { productFromBody } from "../src/services/shop/shopSetup.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const ID = "11111111-1111-4111-8111-111111111111";

describe("shop photo checks", () => {
  it("recognises images by their first bytes", () => {
    assert.equal(sniffImageType(JPEG), "image/jpeg");
    assert.equal(sniffImageType(PNG), "image/png");
    assert.equal(sniffImageType(WEBP), "image/webp");
    assert.equal(sniffImageType(Buffer.from("<svg onload=alert(1)>")), null);
  });

  it("accepts a data URL or plain base64 and sets the type itself", () => {
    const a = photoFromBody({ dataBase64: `data:image/png;base64,${JPEG.toString("base64")}` });
    assert.equal(a.ok, true);
    assert.equal(a.contentType, "image/jpeg");
    assert.equal(photoFromBody({ dataBase64: PNG.toString("base64") }).contentType, "image/png");
  });

  it("refuses empty, non-image and oversized uploads", () => {
    assert.equal(photoFromBody({}).ok, false);
    assert.equal(photoFromBody({ dataBase64: Buffer.from("hello").toString("base64") }).ok, false);
    const big = Buffer.concat([JPEG, Buffer.alloc(SHOP_PHOTO_MAX_BYTES)]);
    assert.equal(photoFromBody({ dataBase64: big.toString("base64") }).ok, false);
  });

  it("lets an item hold only our photo links or https", () => {
    assert.equal(isAllowedPhotoUrl(`/api/market/shop/photos/${ID}`), true);
    assert.equal(isAllowedPhotoUrl("https://example.com/a.jpg"), true);
    assert.equal(isAllowedPhotoUrl("javascript:alert(1)"), false);
    assert.equal(isAllowedPhotoUrl("http://example.com/a.jpg"), false);
    assert.equal(isAllowedPhotoUrl("/api/other"), false);
    const base = { sku: "CK-M", name: "Medium chicken", priceRwf: 8000 };
    assert.equal(productFromBody({ ...base, photoUrl: `/api/market/shop/photos/${ID}` }).ok, true);
    assert.equal(productFromBody({ ...base, photoUrl: "javascript:alert(1)" }).ok, false);
    assert.equal(productFromBody({ ...base, photoUrl: "" }).values.photoUrl, null);
  });

  it("saves and loads through the database", async () => {
    const calls = [];
    const db = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("INSERT")) return { rows: [{ id: ID }] };
      return { rows: params[0] === ID ? [{ content_type: "image/jpeg", bytes: JPEG }] : [] };
    };
    const saved = await saveShopPhoto(db, { dataBase64: JPEG.toString("base64") }, { userId: null });
    assert.deepEqual(saved, { ok: true, photoUrl: `/api/market/shop/photos/${ID}` });
    assert.equal(calls[0].params[0], "image/jpeg");
    assert.ok(Buffer.isBuffer(calls[0].params[1]));
    assert.equal((await loadShopPhoto(db, ID)).contentType, "image/jpeg");
    assert.equal(await loadShopPhoto(db, "not-a-uuid"), null);
    assert.equal(await loadShopPhoto(db, "22222222-2222-4222-8222-222222222222"), null);
  });

  it("explains a missing table", async () => {
    const db = async () => {
      throw Object.assign(new Error("no table"), { code: "42P01" });
    };
    const r = await saveShopPhoto(db, { dataBase64: JPEG.toString("base64") }, null);
    assert.equal(r.status, 503);
  });
});

describe("shop photo routes", () => {
  let server;
  let base;
  const db = async (sql, params) => {
    if (sql.includes("INSERT INTO shop_product_photos")) return { rows: [{ id: ID }] };
    if (sql.includes("FROM shop_product_photos")) {
      return { rows: params[0] === ID ? [{ content_type: "image/jpeg", bytes: JPEG }] : [] };
    }
    return { rows: [] };
  };

  before(async () => {
    const app = express();
    app.use(express.json({ limit: "20mb" }));
    app.use((req, _res, next) => {
      const role = req.headers["x-role"];
      req.authUser = role ? { id: ID, role } : null;
      next();
    });
    app.use("/api/shop/desk", createShopDeskRouter({ dbQuery: db, hasDb: true, appendAudit: () => {} }));
    app.use(
      "/api/market/shop",
      createShopPublicRouter({
        dbQuery: db,
        hasDb: true,
        ipWindowRateLimitMiddleware: () => (_req, _res, next) => next(),
        getAppSettingNumber: (_k, d) => d,
      })
    );
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  it("uploads from the desk only", async () => {
    const body = JSON.stringify({ dataBase64: JPEG.toString("base64") });
    const headers = { "content-type": "application/json" };
    const anon = await fetch(`${base}/api/shop/desk/photos`, { method: "POST", headers, body });
    assert.equal(anon.status, 403);
    const ok = await fetch(`${base}/api/shop/desk/photos`, {
      method: "POST",
      headers: { ...headers, "x-role": "superuser" },
      body,
    });
    assert.equal(ok.status, 201);
    assert.equal((await ok.json()).photoUrl, `/api/market/shop/photos/${ID}`);
  });

  it("serves the photo publicly with a long cache", async () => {
    const res = await fetch(`${base}/api/market/shop/photos/${ID}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.match(res.headers.get("cache-control"), /immutable/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), JPEG);
    const missing = await fetch(`${base}/api/market/shop/photos/22222222-2222-4222-8222-222222222222`);
    assert.equal(missing.status, 404);
  });

  it("keeps the rest of the public shop uncached", async () => {
    const res = await fetch(`${base}/api/market/shop/orders/NOPE?t=x`);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});
