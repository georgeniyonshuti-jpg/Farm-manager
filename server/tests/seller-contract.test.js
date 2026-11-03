import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { previewContract, previewContractPdf, saveContractSettings } from "../src/services/pipeline/sellerContract.js";
import { buildContractPdf, layoutAgreement } from "../src/services/pipeline/sellerContractPdf.js";
import {
  acceptOtpSend,
  agreementFromDoc,
  blockingGaps,
  canApproveContract,
  canEditContractSettings,
  canSendContract,
  checkOtpCode,
  fillContract,
  hashToken,
  kycStatusForContract,
  maskIdNumber,
  presentContract,
  describeGaps,
  signFileQuery,
  signerAllowed,
  signUrl,
  smsConfigured,
  starterBody,
  verifyFileQuery,
} from "../src/services/pipeline/sellerContractText.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("seller contract text", () => {
  it("keeps the team note out of the signed seller agreement", () => {
    const body = agreementFromDoc("seller-contract-v1.md");
    assert.match(body, /SELLER AGREEMENT/);
    assert.match(body, /\{\{commission_percent\}\}/);
    assert.doesNotMatch(body, /not part of the agreement/);
    assert.match(starterBody("buy"), /Buyer agreement/);
    assert.match(starterBody("scout"), /Scout agreement/);
    assert.doesNotMatch(starterBody("buy"), /SELLER AGREEMENT/);
  });

  it("fills known values and leaves unknown ones blank", () => {
    assert.equal(fillContract("Hello {{seller_full_name}}", { seller_full_name: "Aline" }), "Hello Aline");
    assert.equal(fillContract("Rate {{commission_percent}}", {}), "Rate {{commission_percent}}");
  });

  it("blocks sending until company values and the person's name are present", () => {
    const body = "Commission {{commission_percent}} for {{seller_full_name}}.";
    assert.deepEqual(blockingGaps(body, {}, { name: "" }).sort(), ["commission_percent", "seller_full_name"]);
    assert.deepEqual(blockingGaps(body, { commissionPercent: "5" }, { name: "Aline" }), []);
  });

  it("keeps a frozen copy when the template values change later", () => {
    const frozen = presentContract("{{commission_percent}}", { commissionPercent: "5" }, { name: "Aline" }, "CVA-1");
    const later = presentContract("{{commission_percent}}", { commissionPercent: "9" }, { name: "Aline" }, "CVA-1");
    assert.equal(frozen, "5");
    assert.equal(later, "9");
    assert.notEqual(frozen, later);
  });

  it("maps the new status onto the existing four-check column", () => {
    assert.equal(kycStatusForContract("signed"), "submitted");
    assert.equal(kycStatusForContract("approved"), "approved");
    assert.equal(kycStatusForContract("rejected"), "rejected");
    assert.equal(kycStatusForContract("sent"), "missing");
    assert.equal(kycStatusForContract("opened"), "missing");
    assert.equal(kycStatusForContract("expired"), "missing");
  });

  it("limits who can edit, send, and approve", () => {
    assert.equal(canEditContractSettings("superuser"), true);
    assert.equal(canEditContractSettings("sales_coordinator"), false);
    assert.equal(canSendContract("sales_officer"), true);
    assert.equal(canApproveContract("sales_officer"), false);
    assert.equal(canApproveContract("sales_coordinator"), true);
    assert.equal(canApproveContract("company_admin"), false);
  });

  it("masks an ID number and hashes a token", () => {
    assert.equal(maskIdNumber("1199880012345678"), "11••••78");
    assert.equal(maskIdNumber(""), null);
    const token = "abc";
    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), token);
  });

  it("keeps the phone code off until SMS exists", () => {
    assert.equal(smsConfigured(), false);
    const off = acceptOtpSend({ otpRequired: true, smsReady: false, lastSentAt: null });
    assert.equal(off.ok, false);
    assert.match(off.error, /SMS is not connected/);
    const hash = hashToken("123456");
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    assert.equal(checkOtpCode({ code: "123456", hash, expiresAt, attempts: 0 }).ok, true);
    assert.equal(checkOtpCode({ code: "000000", hash, expiresAt, attempts: 0 }).ok, false);
    assert.equal(checkOtpCode({ code: "123456", hash, expiresAt, attempts: 5 }).ok, false);
  });

  it("emails a market link and only the matching account can sign", () => {
    const previousFront = process.env.FRONTEND_URL;
    const previousMarket = process.env.MARKET_PUBLIC_URL;
    process.env.FRONTEND_URL = "https://farm.cleva.rw";
    delete process.env.MARKET_PUBLIC_URL;
    try {
      assert.equal(signUrl("abc"), "https://market.cleva.rw/sign/abc");
      assert.equal(signerAllowed("person-1", "person-1"), true);
      assert.equal(signerAllowed("person-1", "person-2"), false);
      assert.equal(signerAllowed("", "person-1"), false);
      const gaps = describeGaps(["commission_percent", "payout_days"]);
      assert.match(gaps, /Commission percent/);
      assert.match(gaps, /Payout days/);
      assert.doesNotMatch(gaps, /commission_percent/);
    } finally {
      if (previousFront == null) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFront;
      if (previousMarket == null) delete process.env.MARKET_PUBLIC_URL;
      else process.env.MARKET_PUBLIC_URL = previousMarket;
    }
  });

  it("signs a short-lived file link that another contact cannot use", () => {
    const query = signFileQuery("person-a", "selfie");
    assert.equal(verifyFileQuery("person-a", "selfie", query.exp, query.sig), true);
    assert.equal(verifyFileQuery("person-b", "selfie", query.exp, query.sig), false);
  });

  it("turns headings and bold into blocks and keeps signature lines out of the text", () => {
    const body = `${agreementFromDoc("seller-contract-v1.md")}\nSignature: drawn signature, shown on the signature page`;
    const layout = layoutAgreement(body);
    assert.equal(layout.blocks[0].type, "title");
    assert.equal(layout.blocks[0].text, "SELLER AGREEMENT");
    assert.equal(layout.blocks.some((block) => block.type === "heading" && block.text === "1. PARTIES"), true);
    assert.equal(
      layout.blocks.some((block) => block.type === "paragraph" && block.runs.some((run) => run.bold && run.text === "intermediary")),
      true
    );
    const dumped = JSON.stringify(layout.blocks);
    assert.equal(dumped.includes("**"), false);
    assert.equal(dumped.includes("drawn signature"), false);
    assert.equal(layout.signatures.seller.name, "{{seller_full_name}}");
    assert.equal(layout.signatures.company.title, "{{company_signer_title}}");
    const filled = layoutAgreement([
      "## SIGNATURES",
      "**For the Seller:**",
      "Name: Aline Uwase",
      "Signed on: the time recorded on the signature page",
      "**For the Company (Cleva Technologies):**",
      "Name: George Niyonshuti",
      "Title: Chairperson",
      "Approved on: added when the company approves",
    ].join("\n"));
    assert.equal(filled.blocks.length, 0);
    assert.equal(filled.signatures.seller.signedOn, "");
    assert.equal(filled.signatures.company.approvedOn, "");
    assert.equal(filled.signatures.company.title, "Chairperson");
  });

  it("builds a PDF and does not delete tables in the migration", async () => {
    const pdf = await buildContractPdf({
      title: "Sample",
      body: agreementFromDoc("seller-contract-v1.md"),
      header: "SAMPLE — not a signed agreement",
      footer: "Sample only.",
    });
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const sql = readFileSync(join(root, "database/migrations/094_seller_contracts.sql"), "utf8");
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
    assert.match(sql, /seller_contract_settings/);
    assert.match(sql, /seller_contracts/);
  });
});

describe("seller contract settings and preview", () => {
  const db = async (sql) => {
    if (String(sql).includes("COUNT")) return { rows: [{ n: 1 }] };
    return { rows: [{}] };
  };

  it("saves company details for a superuser", async () => {
    const saved = await saveContractSettings(db, {}, { role: "superuser", userId: null });
    assert.equal(saved.ok, true);
    assert.equal(saved.settings.companyLegalName, "");
  });

  it("refuses company details from someone who is not a superuser", async () => {
    const saved = await saveContractSettings(db, {}, { role: "sales_officer", userId: null });
    assert.equal(saved.ok, false);
    assert.equal(saved.status, 403);
  });

  it("fills a sample preview and builds a PDF", async () => {
    const preview = await previewContract(db, { want: "sell", language: "en", body: "Hello {{seller_full_name}}." });
    assert.equal(preview.ok, true);
    assert.equal(preview.text, "Hello Aline Uwase.");
    const pdf = await previewContractPdf(db, { want: "sell", language: "en", body: "Hello {{seller_full_name}}." });
    assert.equal(pdf.ok, true);
    assert.equal(pdf.pdf.subarray(0, 4).toString(), "%PDF");
  });
});
