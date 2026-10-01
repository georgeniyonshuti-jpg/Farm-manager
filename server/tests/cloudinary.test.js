import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSignedUpload,
  cloudinaryConfigFromEnv,
  isCloudinaryUrl,
  signCloudinaryParams,
  validateCloudinaryAsset,
} from "../src/services/pipeline/cloudinary.js";

const env = {
  CLOUDINARY_CLOUD_NAME: "cleva",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  CLOUDINARY_FOLDER: "cleva-market",
};

describe("cloudinary signatures", () => {
  it("requires full credentials", () => {
    assert.equal(cloudinaryConfigFromEnv({}), null);
    assert.ok(cloudinaryConfigFromEnv(env));
  });

  it("signs sorted params the Cloudinary way", () => {
    const sig = signCloudinaryParams({ timestamp: 1700000000, folder: "cleva-market/gallery" }, "secret");
    assert.equal(typeof sig, "string");
    assert.equal(sig.length, 40);
    const again = signCloudinaryParams({ folder: "cleva-market/gallery", timestamp: 1700000000 }, "secret");
    assert.equal(sig, again);
  });

  it("builds a signed upload payload", () => {
    const signed = buildSignedUpload({ purpose: "cover" }, { env, now: 1700000000000 });
    assert.equal(signed.ok, true);
    assert.equal(signed.cloudName, "cleva");
    assert.equal(signed.folder, "cleva-market/cover");
    assert.match(signed.uploadUrl, /api.cloudinary.com/);
    assert.ok(signed.signature);
  });

  it("rejects missing config", () => {
    const signed = buildSignedUpload({}, { env: {} });
    assert.equal(signed.ok, false);
  });
});

describe("cloudinary asset validation", () => {
  it("accepts https Cloudinary URLs for the configured cloud", () => {
    assert.equal(
      isCloudinaryUrl("https://res.cloudinary.com/cleva/image/upload/v1/x.jpg", "cleva"),
      true
    );
    assert.equal(
      isCloudinaryUrl("https://res.cloudinary.com/other/image/upload/v1/x.jpg", "cleva"),
      false
    );
    assert.equal(isCloudinaryUrl("http://evil.test/x.jpg", "cleva"), false);
  });

  it("rejects oversize or foreign assets", () => {
    const bad = validateCloudinaryAsset(
      {
        publicId: "cleva-market/x",
        secureUrl: "https://cdn.example.com/x.jpg",
        bytes: 100,
      },
      { cloudName: "cleva" }
    );
    assert.equal(bad.ok, false);
    const huge = validateCloudinaryAsset(
      {
        publicId: "cleva-market/x",
        secureUrl: "https://res.cloudinary.com/cleva/image/upload/v1/x.jpg",
        bytes: 20 * 1024 * 1024,
      },
      { cloudName: "cleva" }
    );
    assert.equal(huge.ok, false);
    const ok = validateCloudinaryAsset(
      {
        publicId: "cleva-market/x",
        secureUrl: "https://res.cloudinary.com/cleva/image/upload/v1/x.jpg",
        format: "jpg",
        bytes: 1200,
      },
      { cloudName: "cleva" }
    );
    assert.equal(ok.ok, true);
  });
});
