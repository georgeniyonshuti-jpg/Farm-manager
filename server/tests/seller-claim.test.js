import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLAIM_TRANSFER_SQL,
  applyClaimToState,
  claimSignupPath,
  claimSignupUrl,
  marketPublicOrigin,
  classifyClaim,
  executeSellerClaim,
  hashClaimToken,
  scoutLotMayGoPublic,
  scoutPublicConsentSql,
  sellerStatusChips,
} from "../src/services/pipeline/sellerClaim.js";

const now = new Date("2026-10-12T08:00:00Z");
const scout = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const host = "33333333-3333-4333-8333-333333333333";

function pendingClaim(overrides = {}) {
  return {
    id: "claim-1",
    farmProfileId: "farm-1",
    invitedEmail: "seller@example.com",
    status: "pending",
    expiresAt: "2026-10-26T00:00:00Z",
    claimedByUserId: null,
    profileCompanyId: null,
    ownerUserId: null,
    scoutedBy: scout,
    ...overrides,
  };
}

describe("claim link", () => {
  it("builds a market seller signup path and refuses a missing origin", () => {
    const path = claimSignupPath("abc");
    assert.match(path, /from=market/);
    assert.match(path, /accountType=farmer/);
    assert.match(path, /claim=abc/);
    assert.equal(claimSignupUrl("", "abc").ok, false);
    assert.equal(claimSignupUrl("https://farm.cleva.rw/", "abc").url, `https://farm.cleva.rw${path}`);
    assert.equal(marketPublicOrigin("https://farm.cleva.rw", ""), "https://market.cleva.rw");
    assert.equal(marketPublicOrigin("http://localhost:5173", ""), "http://localhost:5173");
  });

  it("hashes tokens and does not keep the raw value", () => {
    const hash = hashClaimToken("raw-token");
    assert.equal(hash.length, 64);
    assert.notEqual(hash, "raw-token");
    assert.equal(hashClaimToken("raw-token"), hash);
  });
});

describe("classifyClaim", () => {
  it("transfers a new market seller", () => {
    const d = classifyClaim({
      claim: pendingClaim(),
      email: "seller@example.com",
      userId: seller,
      marketOnly: true,
      now,
    });
    assert.equal(d.ok, true);
    assert.equal(d.action, "transfer");
  });

  it("rejects an expired token", () => {
    const d = classifyClaim({
      claim: pendingClaim({ expiresAt: "2026-10-01T00:00:00Z" }),
      email: "seller@example.com",
      userId: seller,
      now,
    });
    assert.equal(d.code, "expired");
  });

  it("rejects a used token", () => {
    const d = classifyClaim({
      claim: pendingClaim({ status: "accepted", claimedByUserId: "other" }),
      email: "seller@example.com",
      userId: seller,
      now,
    });
    assert.equal(d.code, "used");
  });

  it("sends an email mismatch to desk review", () => {
    const d = classifyClaim({
      claim: pendingClaim(),
      email: "other@example.com",
      userId: seller,
      now,
    });
    assert.equal(d.action, "needs_review");
    assert.equal(d.code, "email_mismatch");
  });

  it("adopts an empty existing market profile", () => {
    const d = classifyClaim({
      claim: pendingClaim(),
      email: "seller@example.com",
      userId: seller,
      existingProfile: { id: "empty-farm" },
      listingCount: 0,
      now,
    });
    assert.equal(d.action, "adopt");
  });

  it("does not take a profile that already has listings", () => {
    const d = classifyClaim({
      claim: pendingClaim(),
      email: "seller@example.com",
      userId: seller,
      existingProfile: { id: "busy-farm" },
      listingCount: 2,
      now,
    });
    assert.equal(d.code, "has_listings");
    assert.equal(d.action, "needs_review");
  });

  it("is idempotent for the same owner", () => {
    const d = classifyClaim({
      claim: pendingClaim({ status: "accepted", claimedByUserId: seller, ownerUserId: seller }),
      email: "seller@example.com",
      userId: seller,
      now,
    });
    assert.equal(d.action, "idempotent");
  });

  it("refuses a random logged-in user when the invite email differs", () => {
    const d = classifyClaim({
      claim: pendingClaim({ invitedEmail: "owner@farm.test" }),
      email: "stranger@farm.test",
      userId: "99999999-9999-4999-8999-999999999999",
      marketOnly: true,
      now,
    });
    assert.equal(d.ok, false);
    assert.equal(d.code, "email_mismatch");
  });
});

describe("claim transfer keeps the scout", () => {
  it("moves company and owner without touching scout attribution", () => {
    const state = {
      profiles: [
        { id: "empty-farm", ownerUserId: seller, companyId: host, claimToken: null },
        { id: "farm-1", ownerUserId: null, companyId: null, scoutedBy: scout, claimToken: "x" },
      ],
      lots: [
        {
          id: "lot-1",
          farmProfileId: "farm-1",
          source: "scout",
          companyId: null,
          scoutedBy: scout,
          listedBy: scout,
          verificationStatus: "pending_review",
          status: "open",
        },
      ],
      claims: [{ id: "claim-1", status: "pending" }],
    };
    const out = applyClaimToState(state, {
      emptyProfileId: "empty-farm",
      userId: seller,
      hostCompanyId: host,
      farmProfileId: "farm-1",
      claimId: "claim-1",
    });
    assert.equal(out.ok, true);
    assert.equal(out.scoutedBy, scout);
    assert.equal(out.lots[0].scoutedBy, scout);
    assert.equal(out.lots[0].listedBy, scout);
    assert.equal(out.lots[0].verificationStatus, "pending_review");
    assert.equal(state.lots[0].companyId, host);
    assert.equal(state.profiles.find((p) => p.id === "farm-1").ownerUserId, seller);
    assert.equal(state.profiles.find((p) => p.id === "empty-farm"), undefined);
    assert.equal(state.claims[0].status, "accepted");
  });

  it("SQL does not assign scouted_by, listed_by, or verification_status", () => {
    assert.match(CLAIM_TRANSFER_SQL, /SET company_id = \$3::uuid/);
    assert.equal(/SET[\s\S]*scouted_by\s*=/.test(CLAIM_TRANSFER_SQL), false);
    assert.equal(/listed_by\s*=/.test(CLAIM_TRANSFER_SQL), false);
    assert.equal(/verification_status\s*=/.test(CLAIM_TRANSFER_SQL), false);
  });

  it("executeSellerClaim reports the scout on the happy path", async () => {
    const calls = [];
    const dbQuery = async (sql, params) => {
      calls.push(sql);
      if (sql.includes("token_hash")) {
        return { rows: [pendingClaim()] };
      }
      if (sql.includes("owner_user_id = $1")) return { rows: [] };
      if (sql.includes("WITH dropped")) {
        return {
          rows: [
            {
              profileId: "farm-1",
              scoutedBy: scout,
              claimId: "claim-1",
              lots: [{ id: "lot-1", scoutedBy: scout, listedBy: scout, verificationStatus: "pending_review" }],
            },
          ],
        };
      }
      return { rows: [] };
    };
    const out = await executeSellerClaim(dbQuery, {
      rawToken: "raw",
      userId: seller,
      email: "seller@example.com",
      hostCompanyId: host,
      marketOnly: true,
      now,
    });
    assert.equal(out.ok, true);
    assert.equal(out.scoutedBy, scout);
    assert.equal(out.lots[0].listedBy, scout);
    assert.equal(out.lots[0].verificationStatus, "pending_review");
    assert.equal(hashClaimToken("raw"), hashClaimToken("raw"));
    assert.ok(calls.some((sql) => sql.includes("WITH dropped")));
  });
});

describe("public scout gate", () => {
  it("requires consent and verification for scout lots", () => {
    assert.equal(
      scoutLotMayGoPublic(
        { source: "scout", verificationStatus: "verified" },
        { consentStatus: "granted", verificationStatus: "verified" }
      ),
      true
    );
    assert.equal(
      scoutLotMayGoPublic(
        { source: "scout", verificationStatus: "verified" },
        { consentStatus: "pending", verificationStatus: "verified" }
      ),
      false
    );
    assert.equal(
      scoutLotMayGoPublic({ source: "scout", verificationStatus: "pending_review" }, { consentStatus: "granted", verificationStatus: "verified" }),
      false
    );
    const sql = scoutPublicConsentSql("l");
    assert.match(sql, /source IS DISTINCT FROM 'scout'/);
    assert.match(sql, /consent_status = 'granted'/);
    assert.match(sql, /verification_status = 'verified'/);
  });
});

describe("seller status chips", () => {
  it("names invite, claim, review, and live", () => {
    assert.deepEqual(sellerStatusChips({ claimStatus: "pending" }), ["invite_sent"]);
    assert.ok(sellerStatusChips({ ownerUserId: seller, lotVerification: "pending_review" }).includes("claimed"));
    assert.ok(sellerStatusChips({ ownerUserId: seller, lotVerification: "pending_review" }).includes("pending_review"));
    assert.ok(
      sellerStatusChips({
        ownerUserId: seller,
        lotVerification: "verified",
        consentStatus: "granted",
        profileVerification: "verified",
      }).includes("live")
    );
  });
});
