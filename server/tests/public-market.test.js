import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isPublicMarketLotEligible,
  leadReferenceFromId,
  mapPublicLot,
  MATCHED_STATUSES_SQL,
  normalizeWhatsapp,
  priceBand,
  PUBLIC_LOT_SENSITIVE_KEYS,
  validatePublicRequest,
  validatePublicSellRequest,
  parseBuyerRequestExtras,
  isSellLead,
  weekParamToBucketKey,
} from "../src/services/pipeline/publicMarket.js";
import { forwardWeekBuckets } from "../src/services/pipeline/pipeline.js";

describe("publicMarket mapPublicLot", () => {
  it("omits every sensitive field", () => {
    const mapped = mapPublicLot({
      id: "uuid-secret",
      public_ref: "LOT-ABC123",
      companyId: "co-1",
      flockId: "fl-1",
      farmLabel: "Secret Farm",
      contactPhone: "+250700000000",
      scoutedBy: "vet-1",
      listedBy: "admin-1",
      notes: "internal",
      source: "scout",
      status: "open",
      verificationStatus: "verified",
      createdAt: "2026-01-01",
      askPricePerKg: 4000,
      district: "Gasabo",
      birdCount: 200,
      matchedBirds: 20,
      breed_code: "Cobb",
      avg_weight_kg: 1.8,
      expected_weight_kg: 2.0,
      ready_from: "2026-09-20",
      ready_to: "2026-09-25",
      farmer_can_slaughter: true,
      delivery_available: false,
    });
    for (const key of PUBLIC_LOT_SENSITIVE_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(mapped, key), false, `leaked ${key}`);
    }
    assert.equal(mapped.publicRef, "LOT-ABC123");
    assert.equal(mapped.district, "Gasabo");
    assert.equal(mapped.birdsAvailable, 180);
    assert.ok(mapped.priceBandRwf);
    assert.equal(mapped.slaughterAvailable, true);
    assert.equal(mapped.farm, null);
    assert.equal(mapped.visibility, "brokered_public");
    assert.equal(Object.prototype.hasOwnProperty.call(mapped, "scoutConfirmedAt"), false);
  });

  it("keeps scoutConfirmedAt off the guest card and on the deny-list", () => {
    const mapped = mapPublicLot({
      public_ref: "LOT-ABC123",
      birdCount: 100,
      scoutConfirmedAt: "2026-09-20T00:00:00Z",
      scout_confirmed_at: "2026-09-20T00:00:00Z",
    });
    assert.equal(Object.prototype.hasOwnProperty.call(mapped, "scoutConfirmedAt"), false);
    assert.ok(PUBLIC_LOT_SENSITIVE_KEYS.includes("scoutConfirmedAt"));
    for (const key of PUBLIC_LOT_SENSITIVE_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(mapped, key), false, `leaked ${key}`);
    }
  });

  it("attaches a farm card only for consenting public profiles", () => {
    const profile = {
      slug: "green-ridge",
      displayName: "Green Ridge",
      published: true,
      consentStatus: "granted",
      verificationStatus: "verified",
      district: "Gasabo",
      companyId: "secret",
    };
    const mapped = mapPublicLot(
      {
        public_ref: "LOT-ABC123",
        district: "Gasabo",
        birdCount: 100,
        matchedBirds: 0,
        visibilityTier: "profile_public",
        askPricePerKg: 4000,
      },
      { storefrontsEnabled: true, audience: "guest", profile }
    );
    assert.ok(mapped.farm);
    assert.equal(mapped.farm.slug, "green-ridge");
    assert.equal(mapped.farm.companyId, undefined);
    assert.equal(mapped.visibility, "profile_public");
  });

  it("hides farm identity on priced shop rows even when the profile is public", () => {
    const profile = {
      slug: "green-ridge",
      displayName: "Green Ridge",
      published: true,
      consentStatus: "granted",
      verificationStatus: "verified",
      district: "Gasabo",
    };
    const mapped = mapPublicLot(
      {
        public_ref: "LOT-ABC123",
        district: "Gasabo",
        birdCount: 100,
        matchedBirds: 0,
        visibilityTier: "profile_public",
        askPricePerKg: 4000,
        farmLabel: "Green Ridge Farm",
        companyId: "co-1",
      },
      {
        storefrontsEnabled: true,
        audience: "guest",
        profile,
        hideFarm: true,
        offer: {
          rankEligible: true,
          merchantTier: "market_only",
          butcher: { butcherRwfPerKg: 4300, youPayRwf: 774000 },
        },
      }
    );
    assert.equal(mapped.farm, null);
    assert.equal(mapped.visibility, "brokered_public");
    assert.equal(mapped.askPricePerKg, undefined);
    assert.equal(mapped.buyerRwfPerKg, 4300);
    assert.equal(mapped.youPayRwf, 774000);
    for (const key of PUBLIC_LOT_SENSITIVE_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(mapped, key), false, `leaked ${key}`);
    }
  });

  it("keeps verified_buyers listings anonymous for guests", () => {
    const mapped = mapPublicLot(
      {
        public_ref: "LOT-XYZ",
        district: "Kayonza",
        birdCount: 80,
        visibilityTier: "verified_buyers",
        askPricePerKg: 4100,
      },
      {
        storefrontsEnabled: true,
        audience: "guest",
        profile: {
          slug: "hidden",
          displayName: "Hidden",
          published: true,
          consentStatus: "granted",
          verificationStatus: "verified",
        },
      }
    );
    assert.equal(mapped.visibility, "brokered_public");
    assert.equal(mapped.farm, null);
  });
});

describe("publicMarket priceBand", () => {
  it("rounds and widens around ask", () => {
    const b = priceBand(4000);
    assert.ok(b);
    assert.ok(b.min < 4000);
    assert.ok(b.max > 4000);
    assert.equal(b.min % 100, 0);
    assert.equal(b.max % 100, 0);
  });

  it("returns null under floor", () => {
    assert.equal(priceBand(100), null);
    assert.equal(priceBand(null), null);
  });

  it("guest lot band follows butcher price, not farm-gate ask", () => {
    const fromAsk = mapPublicLot({
      public_ref: "LOT-ASK",
      birdCount: 100,
      askPricePerKg: 3800,
    });
    const fromButcher = mapPublicLot(
      {
        public_ref: "LOT-ASK",
        birdCount: 100,
        askPricePerKg: 3800,
      },
      { butcherPricePerKg: 4300 }
    );
    assert.deepEqual(fromButcher.priceBandRwf, priceBand(4300));
    assert.notDeepEqual(fromButcher.priceBandRwf, fromAsk.priceBandRwf);
  });
});

describe("publicMarket validatePublicRequest", () => {
  it("rejects missing phone and honeypot", () => {
    assert.equal(validatePublicRequest({ contactName: "A", phone: "" }).ok, false);
    assert.equal(
      validatePublicRequest({ contactName: "Ann", phone: "+250788123456", honeypot: "bot" }).ok,
      false
    );
  });

  it("rejects bad birds", () => {
    assert.equal(
      validatePublicRequest({ contactName: "Ann", phone: "+250788123456", birds: 0 }).ok,
      false
    );
  });

  it("accepts valid lead", () => {
    const v = validatePublicRequest({
      contactName: "Ann",
      phone: "+250788123456",
      birds: 40,
      formStartedAt: Date.now() - 5000,
    });
    assert.equal(v.ok, true);
  });

  it("parses shop terms and this/next week onto neededFrom", () => {
    const now = new Date("2026-09-23T10:00:00+02:00");
    const buckets = forwardWeekBuckets(now);
    const extras = parseBuyerRequestExtras(
      {
        typicalBirdsPerWeek: 80,
        settleTerms: "days_14",
        expectedRwfPerKg: "board",
        handover: "collect",
        process: "slaughter",
        neededWhen: "this",
      },
      now
    );
    assert.equal(extras.typicalBirdsPerWeek, 80);
    assert.equal(extras.settleTerms, "days_14");
    assert.equal(extras.expectedRwfPerKg, null);
    assert.equal(extras.handover, "collect");
    assert.equal(extras.process, "slaughter");
    assert.equal(extras.neededFrom, buckets[0].from);

    const next = parseBuyerRequestExtras({ neededWhen: "next" }, now);
    assert.equal(next.neededFrom, buckets[1].from);

    const dated = parseBuyerRequestExtras({ neededWhen: "date", neededFrom: "2026-10-02" }, now);
    assert.equal(dated.neededFrom, "2026-10-02");

    const under = parseBuyerRequestExtras({ expectedRwfPerKg: 3900 });
    assert.equal(under.expectedRwfPerKg, 3900);

    const junk = parseBuyerRequestExtras({ settleTerms: "momo", handover: "drone", process: "halal" });
    assert.equal(junk.settleTerms, null);
    assert.equal(junk.handover, null);
    assert.equal(junk.process, null);
  });

  it("keeps extras on a valid request payload", () => {
    const v = validatePublicRequest({
      contactName: "Ann",
      phone: "+250788123456",
      birds: 40,
      formStartedAt: Date.now() - 5000,
      typicalBirdsPerWeek: 120,
      settleTerms: "cash_scale",
      expectedRwfPerKg: 4100,
      handover: "delivery",
      process: "live",
      neededWhen: "next",
    });
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.typicalBirdsPerWeek, 120);
      assert.equal(v.settleTerms, "cash_scale");
      assert.equal(v.expectedRwfPerKg, 4100);
      assert.equal(v.handover, "delivery");
      assert.equal(v.process, "live");
      assert.ok(v.neededFrom);
    }
  });

  it("sell request requires a bird count", () => {
    const missing = validatePublicSellRequest({
      contactName: "Ann",
      phone: "+250788123456",
      formStartedAt: Date.now() - 5000,
    });
    assert.equal(missing.ok, false);
    const ok = validatePublicSellRequest({
      contactName: "Ann",
      phone: "+250788123456",
      birds: 80,
      formStartedAt: Date.now() - 5000,
    });
    assert.equal(ok.ok, true);
  });

  it("isSellLead keys off public_sell or farmer", () => {
    assert.equal(isSellLead({ source: "public_sell" }), true);
    assert.equal(isSellLead({ source: "public_market", buyerType: "farmer" }), true);
    assert.equal(isSellLead({ source: "public_market", buyerType: "butcher" }), false);
  });
});

describe("publicMarket filters", () => {
  it("weekParamToBucketKey maps this|next|later", () => {
    assert.equal(weekParamToBucketKey("this"), "this_week");
    assert.equal(weekParamToBucketKey("next"), "next_week");
    assert.equal(weekParamToBucketKey("later"), "week_after");
    assert.equal(weekParamToBucketKey(""), null);
  });

  it("leadReferenceFromId formats REQ-", () => {
    assert.match(leadReferenceFromId("abcdef12-3456-7890"), /^REQ-ABCDEF12$/);
  });
});

describe("publicMarket route correctness", () => {
  it("counts committed and delivered matches, never confirmed", () => {
    assert.equal(MATCHED_STATUSES_SQL.includes("committed"), true);
    assert.equal(MATCHED_STATUSES_SQL.includes("delivered"), true);
    const src = readFileSync(
      fileURLToPath(new URL("../src/routes/publicMarket.routes.js", import.meta.url)),
      "utf8"
    );
    assert.ok(src.includes("MATCHED_STATUSES_SQL"));
    assert.equal(src.includes("status = 'confirmed'"), false);
    assert.ok(src.includes("/sell-requests"));
    assert.ok(src.includes("public_sell"));
    assert.ok(src.includes('"/quote"'));
    assert.ok(src.includes('"/board"'));
  });

  it("desk match path locks the lot row", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/routes/pipeline.routes.js", import.meta.url)),
      "utf8"
    );
    assert.ok(src.includes("FOR UPDATE"));
    assert.ok(src.includes('await dbQuery("BEGIN")'));
    const extras = readFileSync(
      fileURLToPath(new URL("../src/routes/pipelineMarketExtras.js", import.meta.url)),
      "utf8"
    );
    assert.ok(extras.includes("public_sell"));
    assert.ok(extras.includes("market.lead.convert_sell"));
    assert.ok(extras.includes("'scout'"));
    assert.ok(extras.includes("farmGateFromQuoteJson"));
    assert.ok(extras.includes("ask_price_per_kg"));
    assert.ok(extras.includes("typical_birds_per_week"));
    assert.ok(extras.includes("settle_terms"));
    assert.ok(extras.includes("expected_rwf_per_kg"));
    const pub = readFileSync(
      fileURLToPath(new URL("../src/routes/publicMarket.routes.js", import.meta.url)),
      "utf8"
    );
    assert.ok(pub.includes("typical_birds_per_week"));
    assert.ok(pub.includes("neededWhen"));
  });

  it("summary, featured, and lot detail use the shared legacy-schema guard", () => {
    const pub = readFileSync(
      fileURLToPath(new URL("../src/routes/publicMarket.routes.js", import.meta.url)),
      "utf8"
    );
    assert.ok(pub.includes("async function runPublicLotQuery"));
    assert.ok(pub.includes("function legacyWhere"));
    const summaryIdx = pub.indexOf('router.get("/summary"');
    const featuredIdx = pub.indexOf('router.get("/featured"');
    const detailIdx = pub.indexOf('router.get("/lots/:publicRef"');
    assert.ok(summaryIdx > 0 && featuredIdx > summaryIdx && detailIdx > 0);
    assert.ok(pub.slice(summaryIdx, featuredIdx).includes("runPublicLotQuery"));
    assert.ok(pub.slice(featuredIdx).includes("runPublicLotQuery"));
    assert.ok(pub.slice(detailIdx, summaryIdx).includes("runPublicLotQuery"));
  });
});

describe("publicMarket eligibility", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const shop = {
    scoutConfirmedAt: "2026-09-20T00:00:00Z",
    readyFrom: "2026-09-21",
    readyTo: "2026-09-27",
    now,
  };

  it("accepts verified open with remaining birds when weighed this week", () => {
    assert.equal(
      isPublicMarketLotEligible({ status: "open", verificationStatus: "verified", remaining: 10, ...shop }),
      true
    );
    assert.equal(
      isPublicMarketLotEligible({ status: "partial", verificationStatus: "verified", remaining: 1, ...shop }),
      true
    );
  });

  it("rejects draft, pending_review, rejected, fully booked, and unweighed", () => {
    assert.equal(
      isPublicMarketLotEligible({ status: "draft", verificationStatus: "verified", remaining: 10, ...shop }),
      false
    );
    assert.equal(
      isPublicMarketLotEligible({
        status: "open",
        verificationStatus: "pending_review",
        remaining: 10,
        ...shop,
      }),
      false
    );
    assert.equal(
      isPublicMarketLotEligible({ status: "open", verificationStatus: "rejected", remaining: 10, ...shop }),
      false
    );
    assert.equal(
      isPublicMarketLotEligible({ status: "open", verificationStatus: "verified", remaining: 0, ...shop }),
      false
    );
    assert.equal(
      isPublicMarketLotEligible({
        status: "open",
        verificationStatus: "verified",
        remaining: 10,
        readyFrom: shop.readyFrom,
        readyTo: shop.readyTo,
        now,
      }),
      false
    );
  });
});

describe("publicMarket board-first helpers", () => {
  it("guest card shows the weigh day only", () => {
    const mapped = mapPublicLot({
      public_ref: "LOT-W1",
      birdCount: 100,
      scoutConfirmedAt: "2026-09-21T14:32:10Z",
    });
    assert.equal(mapped.checkedOn, "2026-09-21");
    assert.equal(Object.prototype.hasOwnProperty.call(mapped, "scoutConfirmedAt"), false);
    assert.equal(mapPublicLot({ public_ref: "LOT-W2", birdCount: 10 }).checkedOn, null);
  });

  it("normalizeWhatsapp keeps digits with country code", () => {
    assert.equal(normalizeWhatsapp("+250 788 123 456"), "250788123456");
    assert.equal(normalizeWhatsapp("0788123456"), "250788123456");
    assert.equal(normalizeWhatsapp("12345"), null);
    assert.equal(normalizeWhatsapp(""), null);
  });
});
