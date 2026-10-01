import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FARM_COMPANY_ID,
  DEFAULT_FARM_SLUG,
  isMarketSignupRequest,
  loadMarketHostCompany,
  marketHostLookup,
} from "../src/services/pipeline/marketHostCompany.js";

describe("marketHostLookup", () => {
  it("prefers MARKET_HOST_COMPANY_ID and rejects default-farm", () => {
    const byId = marketHostLookup({ MARKET_HOST_COMPANY_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    assert.deepEqual(byId, { ok: true, by: "id", value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

    const banned = marketHostLookup({ MARKET_HOST_COMPANY_ID: DEFAULT_FARM_COMPANY_ID });
    assert.equal(banned.ok, false);

    const bySlug = marketHostLookup({ MARKET_HOST_COMPANY_SLUG: "cleva-technologies" });
    assert.deepEqual(bySlug, { ok: true, by: "slug", value: "cleva-technologies" });

    const defaultSlug = marketHostLookup({ MARKET_HOST_COMPANY_SLUG: DEFAULT_FARM_SLUG });
    assert.equal(defaultSlug.ok, false);
  });

  it("defaults slug to cleva-technologies when env is empty", () => {
    const lookup = marketHostLookup({});
    assert.deepEqual(lookup, { ok: true, by: "slug", value: "cleva-technologies" });
  });
});

describe("isMarketSignupRequest", () => {
  it("reads from=market on body or query", () => {
    assert.equal(isMarketSignupRequest({ body: { from: "market" } }), true);
    assert.equal(isMarketSignupRequest({ query: { from: "market" } }), true);
    assert.equal(isMarketSignupRequest({ body: { from: "farm" } }), false);
    assert.equal(isMarketSignupRequest({ body: {} }), false);
  });
});

describe("loadMarketHostCompany", () => {
  it("returns 503-style miss when the host row is absent", async () => {
    const miss = await loadMarketHostCompany(async () => ({ rows: [] }), {
      MARKET_HOST_COMPANY_SLUG: "cleva-technologies",
    });
    assert.equal(miss.ok, false);

    const banned = await loadMarketHostCompany(
      async () => ({ rows: [{ id: DEFAULT_FARM_COMPANY_ID, slug: DEFAULT_FARM_SLUG, name: "Default" }] }),
      { MARKET_HOST_COMPANY_SLUG: "cleva-technologies" }
    );
    assert.equal(banned.ok, false);
  });

  it("returns the host company when the row is real", async () => {
    const hit = await loadMarketHostCompany(
      async () => ({
        rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", slug: "cleva-technologies", name: "Cleva Technologies" }],
      }),
      { MARKET_HOST_COMPANY_SLUG: "cleva-technologies" }
    );
    assert.equal(hit.ok, true);
    if (hit.ok) assert.equal(hit.company.slug, "cleva-technologies");
  });
});

describe("saas signup host vs farm", () => {
  it("market path attaches to host; farm path still inserts a company", () => {
    const saas = readFileSync(fileURLToPath(new URL("../src/routes/saasRoutes.js", import.meta.url)), "utf8");
    assert.ok(saas.includes("isMarketSignupRequest"));
    assert.ok(saas.includes("loadMarketHostCompany"));
    assert.ok(saas.includes("fromMarket"));
    assert.ok(saas.includes("INSERT INTO companies"));
    assert.ok(saas.includes('fromMarket ? "market" : "farm_os"'));
    assert.ok(saas.includes("status(503)"));
    assert.ok(saas.includes("VALUES ($1, $2, $3, $4, $4, $5::uuid, 'verified', true)"));
    assert.ok(saas.includes('accountType === "buyer" ? "verified" : "pending"'));
    assert.ok(saas.includes("INSERT INTO farm_profiles"));
    assert.ok(saas.includes("owner_user_id"));
    assert.ok(saas.includes("createUniqueFarmSlug"));
  });
});

describe("host seller listing scope", () => {
  it("my-listings and jobs do not filter host lots by company_id alone", () => {
    const extras = readFileSync(
      fileURLToPath(new URL("../src/routes/pipelineMarketExtras.js", import.meta.url)),
      "utf8"
    );
    const fulfillment = readFileSync(
      fileURLToPath(new URL("../src/routes/pipelineFulfillmentExtras.js", import.meta.url)),
      "utf8"
    );
    const weigh = readFileSync(
      fileURLToPath(new URL("../src/routes/pipelineWeighExtras.js", import.meta.url)),
      "utf8"
    );
    const migration = readFileSync(
      fileURLToPath(new URL("../../database/migrations/074_farm_profile_owner.sql", import.meta.url)),
      "utf8"
    );
    assert.ok(extras.includes("appendFarmerLotScope"));
    assert.ok(extras.includes("farmerOwnsLot"));
    assert.ok(extras.includes("loadProfileForFarmer"));
    assert.ok(extras.includes("listingRailDecision"));
    assert.ok(extras.includes('verificationStatus = !rail.inRail || !skipReview ? "pending_review" : "verified"'));
    assert.ok(fulfillment.includes("isMarketOnlySeller"));
    assert.ok(fulfillment.includes("listedBy"));
    assert.ok(weigh.includes("owner_user_id"));
    assert.ok(migration.includes("owner_user_id"));
    assert.ok(migration.includes("idx_farm_profiles_company_unowned"));
    assert.ok(migration.includes("idx_farm_profiles_owner"));
  });
});

describe("buyer login accounts skip review hold", () => {
  it("treats an active buyer as live without verification_status === verified", () => {
    const extras = readFileSync(
      fileURLToPath(new URL("../src/routes/pipelineMarketExtras.js", import.meta.url)),
      "utf8"
    );
    assert.ok(extras.includes("function requireVerifiedBuyer(buyer)"));
    assert.ok(extras.includes("Boolean(buyer && buyer.active !== false)"));
    assert.equal(extras.includes('buyer.verificationStatus === "verified"'), false);
    assert.ok(extras.includes('error: "Buyer account is not active."'));
  });
});
