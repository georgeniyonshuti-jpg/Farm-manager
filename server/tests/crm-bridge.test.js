import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import {
  SELLER_QUEUE_INSERT,
  buildSsoClaims,
  classifySignupToken,
  contactTypeKey,
  crmRoleForUser,
  decideConvert,
  hashToken,
  crmInboxConfigured,
  launchCrm,
  maskPhone,
  matchIsCompatible,
  newSignupToken,
  nextVisitStatus,
  outboxAfterFailure,
  rememberInbound,
  requireHandoffNote,
  scoutCoversDistrict,
  scoutOwnsRow,
  signBody,
  signCrmJwt,
  signupUrlForToken,
  toE164,
  verifyCrmSignature,
} from "../src/services/pipeline/crmBridge.js";

describe("phones", () => {
  it("normalizes Rwanda numbers to E.164 and masks them", () => {
    assert.equal(toE164("0788123456"), "+250788123456");
    assert.equal(toE164("+250 788-123-456"), "+250788123456");
    assert.equal(toE164("250788123456"), "+250788123456");
    assert.equal(toE164("788123456"), "+250788123456");
    assert.equal(toE164("123"), null);
    assert.equal(toE164("+447911123456"), "+447911123456");
    assert.match(maskPhone("+250788123456"), /^\+25078\*+56$/);
    assert.equal(maskPhone("+250788123456").includes("788123"), false);
  });
});

describe("HMAC", () => {
  it("accepts a fresh signature and rejects a bad or old one", () => {
    const secret = "test-secret";
    const raw = '{"crm_lead":"CRM-LEAD-1"}';
    const now = 1_700_000_000_000;
    const timestamp = String(Math.trunc(now / 1000));
    const signature = `v1=${signBody(secret, timestamp, raw)}`;
    assert.equal(verifyCrmSignature({ secret, timestamp, signature, rawBody: raw, nowMs: now }).ok, true);
    assert.equal(
      verifyCrmSignature({ secret, timestamp, signature: "v1=nope", rawBody: raw, nowMs: now }).ok,
      false
    );
    assert.equal(
      verifyCrmSignature({
        secret,
        timestamp: String(Math.trunc(now / 1000) - 600),
        signature,
        rawBody: raw,
        nowMs: now,
      }).ok,
      false
    );
  });

  it("treats a repeated request id as a replay", async () => {
    const seen = new Set();
    const query = async (_sql, params) => {
      if (seen.has(params[0])) return { rows: [] };
      seen.add(params[0]);
      return { rows: [{ id: "1" }] };
    };
    assert.equal(await rememberInbound(query, "req-1"), true);
    assert.equal(await rememberInbound(query, "req-1"), false);
  });
});

describe("signup tokens", () => {
  it("stores a hash, expires, and refuses reuse", () => {
    const raw = newSignupToken();
    assert.notEqual(hashToken(raw), raw);
    assert.equal(hashToken(raw).length, 64);
    const row = {
      expires_at: "2026-10-28T00:00:00Z",
      used_at: null,
    };
    assert.equal(classifySignupToken(row, new Date("2026-10-21T00:00:00Z")).ok, true);
    assert.equal(classifySignupToken({ ...row, used_at: "2026-10-22T00:00:00Z" }).code, "used");
    assert.equal(
      classifySignupToken(row, new Date("2026-11-01T00:00:00Z")).code,
      "expired"
    );
    const previousOrigin = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://farm.cleva.rw";
    const url = signupUrlForToken(raw, "seller");
    if (previousOrigin == null) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousOrigin;
    assert.equal(url.ok, true);
    assert.match(url.url, /\/signup\?/);
    assert.match(url.url, /accountType=farmer/);
    assert.doesNotMatch(url.url, /\/join/);
  });
});

describe("convert", () => {
  it("queues a seller and never describes a public lot", () => {
    const decision = decideConvert({ contactType: "seller", phoneMatches: [] });
    assert.equal(decision.action, "create_seller_queue");
    assert.equal(SELLER_QUEUE_INSERT.includes("pipeline_lots"), false);
    assert.equal(contactTypeKey("Scout Candidate"), "scout_candidate");
    assert.equal(decideConvert({ contactType: "buyer", phoneMatches: [] }).action, "create_market_lead");
    assert.equal(decideConvert({ contactType: "scout_candidate", phoneMatches: [] }).action, "pending_scout");
  });

  it("links one compatible phone and flags an ambiguous or wrong-type match", () => {
    const linked = decideConvert({
      contactType: "buyer",
      phoneMatches: [{ entityType: "market_lead", entityId: "m1" }],
    });
    assert.equal(linked.action, "link");
    assert.equal(
      decideConvert({
        contactType: "seller",
        phoneMatches: [
          { entityType: "farm_profile", entityId: "f1" },
          { entityType: "market_lead", entityId: "m1" },
        ],
      }).action,
      "ambiguous"
    );
    assert.equal(
      decideConvert({
        contactType: "seller",
        phoneMatches: [{ entityType: "market_lead", entityId: "m1" }],
      }).action,
      "ambiguous"
    );
    assert.equal(matchIsCompatible("seller", "farm_profile"), true);
    const again = decideConvert({
      contactType: "seller",
      existingLeadLink: { cleva_entity_type: "seller_queue", cleva_entity_id: "q1", ambiguous: false },
    });
    assert.equal(again.action, "existing");
    assert.equal(again.recordId, "q1");
  });
});

describe("launch roles", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const env = {
    CRM_INTEGRATION_ENABLED: "true",
    CRM_BASE_URL: "https://crm-staging.cleva.rw",
    CRM_SSO_PRIVATE_KEY: Buffer.from(pem).toString("base64"),
  };

  it("gives desk staff a short token and refuses buyers, sellers, and scouts", () => {
    assert.equal(crmRoleForUser({ role: "buyer", crm_role: "supervisor" }), null);
    assert.equal(crmRoleForUser({ role: "manager" }), null);
    assert.equal(crmRoleForUser({ role: "vet" }), null);
    assert.equal(crmRoleForUser({ role: "sales_coordinator" }), "marketer");
    assert.equal(crmRoleForUser({ role: "superuser", isActive: false }), null);
    assert.equal(launchCrm({ role: "buyer", id: "b", email: "b@cleva.rw" }, env).status, 403);
    assert.equal(launchCrm({ role: "vet", id: "s", email: "s@cleva.rw" }, env).status, 403);
    assert.equal(launchCrm({ role: "sales_coordinator", id: "m", email: "m@cleva.rw" }, { CRM_INTEGRATION_ENABLED: "false" }).status, 404);

    const staff = { id: "11111111-1111-4111-8111-111111111111", email: "desk@cleva.rw", displayName: "Desk", role: "sales_coordinator" };
    const launch = launchCrm(staff, env);
    assert.equal(launch.configured, true);
    assert.equal(crmInboxConfigured({ CRM_INTEGRATION_ENABLED: "false" }), false);
    assert.equal(crmInboxConfigured({ CRM_INTEGRATION_ENABLED: "true", CRM_BASE_URL: "https://crm-staging.cleva.rw" }), false);
    assert.equal(crmInboxConfigured(env), true);
    const [h, p, s] = launch.token.split(".");
    const verified = crypto.verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      publicKey,
      Buffer.from(s, "base64url")
    );
    assert.equal(verified, true);
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    assert.equal(claims.crm_role, "marketer");
    assert.equal(claims.aud, "cleva-crm");
    assert.ok(claims.exp - claims.iat <= 60);
    assert.equal(buildSsoClaims(staff).crm_role, "marketer");
    assert.equal(signCrmJwt(buildSsoClaims({ role: "superuser", id: staff.id, email: staff.email, displayName: "Boss" }), pem).split(".").length, 3);
  });
});

describe("scouts and outbox", () => {
  it("keeps a seller on the assigned scout and blocks skipped steps", () => {
    const row = { assignedScoutUserId: "scout-1" };
    assert.equal(scoutOwnsRow(row, "scout-1"), true);
    assert.equal(scoutOwnsRow(row, "scout-2"), false);
    assert.equal(scoutCoversDistrict("Gasabo", "gasabo"), true);
    assert.equal(scoutCoversDistrict("Gasabo", "Musanze"), false);
    assert.equal(scoutCoversDistrict("", "Musanze"), true);
    assert.equal(requireHandoffNote("", "  ").ok, false);
    assert.equal(requireHandoffNote("40 broilers, call first", "").note, "40 broilers, call first");
    assert.equal(requireHandoffNote("", "Ready next week").ok, true);
    assert.equal(nextVisitStatus("new", "contacted"), "contacted");
    assert.equal(nextVisitStatus("new", "outcome_recorded"), null);
    assert.equal(nextVisitStatus("visit_scheduled", "visit_completed"), "visit_completed");
  });

  it("stops retrying permanent failures and after eight attempts", () => {
    assert.equal(outboxAfterFailure(0, 422).status, "dead");
    const first = outboxAfterFailure(0, 503);
    assert.equal(first.status, "failed");
    assert.equal(first.delaySeconds, 30);
    assert.equal(outboxAfterFailure(1, 503).delaySeconds, 120);
    assert.equal(outboxAfterFailure(7, 503).status, "dead");
  });
});
