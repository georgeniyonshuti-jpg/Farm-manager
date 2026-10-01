import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBookingEmail,
  buildBuyerVerifiedEmail,
  buildCommissionAccruedEmail,
  buildCommissionPaidEmail,
  buildFarmVerifiedEmail,
  buildFarmClaimEmail,
  buildFulfillmentConfirmedEmail,
  buildFulfillmentExceptionEmail,
  buildFulfillmentSettledEmail,
  buildLeadReceivedEmail,
  buildLotLiveEmail,
  notifyMany,
  sendMarketMail,
} from "../src/services/pipeline/marketNotify.js";

describe("marketNotify builders", () => {
  it("buildBookingEmail includes birds and place", () => {
    const m = buildBookingEmail({ name: "Ann", birds: 120, district: "Gasabo" });
    assert.match(m.subject, /120/);
    assert.match(m.subject, /Gasabo/);
    assert.match(m.text, /Ann/);
  });

  it("buildFarmVerifiedEmail and buyer verified", () => {
    assert.match(buildFarmVerifiedEmail({ name: "Bo" }).subject, /verified/i);
    assert.match(buildBuyerVerifiedEmail({ name: "Cy" }).subject, /buyer/i);
  });

  it("buildLotLiveEmail and commission mails", () => {
    assert.match(buildLotLiveEmail({ name: "D", district: "Kayonza", birds: 50 }).text, /Kayonza/);
    assert.match(buildCommissionAccruedEmail({ name: "E", amountRwf: 12000 }).subject, /12000/);
    assert.match(buildCommissionPaidEmail({ name: "E", amountRwf: 12000 }).subject, /paid/i);
    assert.match(buildFarmClaimEmail({ name: "Ann", farmName: "Green Ridge", claimUrl: "https://farm.cleva.rw/signup?claim=x" }).text, /Green Ridge/);
    assert.match(buildFulfillmentConfirmedEmail({ name: "Bo", side: "buyer", birds: 40, district: "Gasabo" }).subject, /buyer/i);
    assert.match(buildFulfillmentSettledEmail({ name: "Bo", birds: 40 }).subject, /settled/i);
    assert.match(buildFulfillmentExceptionEmail({ name: "Ops", kind: "short", birds: 40 }).text, /short/);
    assert.match(
      buildLeadReceivedEmail({ reference: "REQ-ABC", contactName: "Ann", phone: "0788", birds: 40, kind: "sell" })
        .subject,
      /seller/i
    );
  });
});

describe("sendMarketMail", () => {
  it("no-ops when SMTP unset", async () => {
    const r = await sendMarketMail(
      { to: "a@b.com", subject: "x", text: "y" },
      async () => {
        throw new Error("should not send");
      },
      () => null
    );
    assert.equal(r.sent, false);
    assert.equal(r.reason, "smtp_unset");
  });

  it("sends when SMTP and sendFn succeed", async () => {
    const calls = [];
    const r = await sendMarketMail(
      { to: "a@b.com", subject: "Hi", text: "Body" },
      async (smtp, mail) => {
        calls.push({ smtp, mail });
      },
      () => ({ host: "h", user: "u", password: "p", from: "f@x.com", port: 587 })
    );
    assert.equal(r.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mail.to, "a@b.com");
    assert.equal(calls[0].mail.subject, "Hi");
  });

  it("rejects bad to", async () => {
    const r = await sendMarketMail(
      { to: "nope", subject: "x", text: "y" },
      async () => {},
      () => ({ host: "h", user: "u", password: "p", from: "f@x.com" })
    );
    assert.equal(r.sent, false);
    assert.equal(r.reason, "bad_to");
  });
});

describe("notifyMany", () => {
  it("calls send for each recipient with email", async () => {
    const sent = [];
    await notifyMany(
      [{ email: "a@x.com", fullName: "A" }, { email: "", fullName: "B" }, { email: "c@x.com", fullName: "C" }],
      (u) => buildFarmVerifiedEmail({ name: u.fullName }),
      {
        sendMarketMail: async (mail) => {
          sent.push(mail.to);
          return { sent: true };
        },
      }
    );
    assert.deepEqual(sent, ["a@x.com", "c@x.com"]);
  });
});
