import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isAdOrMarketSignup,
  resolveSignupSource,
  campaignSignupLinks,
  attributionFieldsFromReq,
} from "../src/services/pipeline/signupAttribution.js";
import { scoutPayoutAllowed } from "../src/services/pipeline/peopleOnboarding.js";
import { isMarketSignupRequest } from "../src/services/pipeline/marketHostCompany.js";

describe("signup attribution", () => {
  it("treats utm_source=facebook and from=facebook as market signup", () => {
    assert.equal(isAdOrMarketSignup({ body: { utm_source: "facebook" } }), true);
    assert.equal(isAdOrMarketSignup({ query: { from: "facebook" } }), true);
    assert.equal(isAdOrMarketSignup({ body: { gclid: "abc" } }), true);
    assert.equal(isAdOrMarketSignup({ body: { from: "market" } }), true);
    assert.equal(isAdOrMarketSignup({ body: {} }), false);
    assert.equal(isMarketSignupRequest({ body: { utm_source: "instagram" } }), true);
  });

  it("resolves channel from utm then from", () => {
    assert.equal(
      resolveSignupSource({ body: { utm_source: "facebook", from: "market" } }),
      "facebook"
    );
    assert.equal(resolveSignupSource({ body: { from: "instagram" } }), "instagram");
    assert.equal(resolveSignupSource({ body: { from: "market" } }), "direct");
  });

  it("campaign links always include from=market and utm_source channel", () => {
    const links = campaignSignupLinks("https://market.cleva.rw");
    assert.ok(links.some((l) => l.source === "facebook"));
    assert.ok(links.some((l) => l.source === "whatsapp"));
    assert.ok(links.some((l) => l.source === "instagram"));
    assert.ok(links.some((l) => l.source === "google"));
    for (const l of links) {
      assert.equal(
        l.url,
        `https://market.cleva.rw/signup?from=market&utm_source=${l.source}`
      );
      assert.equal(l.url.includes("utm_medium"), false);
    }
    const withCamp = campaignSignupLinks("https://market.cleva.rw", "spring");
    assert.ok(withCamp[0].url.includes("utm_campaign=spring"));
    assert.ok(withCamp[0].url.includes("from=market"));
  });

  it("attributionFieldsFromReq captures click ids", () => {
    const a = attributionFieldsFromReq({
      body: { utm_source: "google", gclid: "x", landingPath: "/signup" },
    });
    assert.equal(a.source, "google");
    assert.equal(a.clickIdKind, "gclid");
    assert.equal(a.landingPath, "/signup");
  });
});

describe("saas signup logging and instant scout access", () => {
  it("logs attempts, creates people_onboarding, and skips scout_pending", () => {
    const saas = readFileSync(
      fileURLToPath(new URL("../src/routes/saasRoutes.js", import.meta.url)),
      "utf8"
    );
    assert.ok(saas.includes("logSignupAttemptFromReq"));
    assert.ok(saas.includes("upsertPeopleOnboarding"));
    assert.ok(saas.includes("buildSignupDeskEmail"));
    assert.ok(saas.includes("// Scouts get instant access"));
    assert.ok(saas.includes("const departmentKeys = [];"));
    assert.equal(saas.includes('accountType === "scout" ? ["scout_pending"]'), false);
  });

  it("migration clears scout_pending and creates CRM tables", () => {
    const migration = readFileSync(
      fileURLToPath(new URL("../../database/migrations/079_signups_crm.sql", import.meta.url)),
      "utf8"
    );
    assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS signup_attempts"));
    assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS people_onboarding"));
    assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS onboarding_touches"));
    assert.ok(migration.includes("scout_pending"));
  });
});

describe("scout payout gate", () => {
  it("holds payout until onboarded or active", async () => {
    const rows = [{ stage: "new", is_blocked: false }];
    const gate = await scoutPayoutAllowed(async () => ({ rows }), "u1");
    assert.equal(gate.allowed, false);
    assert.equal(gate.reason, "new");

    const ok = await scoutPayoutAllowed(
      async () => ({ rows: [{ stage: "onboarded", is_blocked: false }] }),
      "u1"
    );
    assert.equal(ok.allowed, true);

    const blocked = await scoutPayoutAllowed(
      async () => ({ rows: [{ stage: "active", is_blocked: true }] }),
      "u1"
    );
    assert.equal(blocked.allowed, false);
  });

  it("commission pay endpoint checks scoutPayoutAllowed", () => {
    const extras = readFileSync(
      fileURLToPath(new URL("../src/routes/pipelineMarketExtras.js", import.meta.url)),
      "utf8"
    );
    assert.ok(extras.includes("scoutPayoutAllowed"));
    assert.ok(extras.includes("scout_not_onboarded"));
  });
});
