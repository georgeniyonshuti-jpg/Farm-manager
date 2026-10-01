/**
 * Reserve → plan → dual confirm → settle.
 * Commission accrues only after both sides (or ops) close the handshake.
 */

export const COLLECT_OR_DELIVERY = ["collect", "delivery"];
export const SLAUGHTER_MODES = ["farm", "buyer", "none"];
export const DELIVERY_ACTORS = ["buyer", "farm", "cleva"];
export const NEED_CLEVA_DELIVERY_MARKER = "[NEED_CLEVA_DELIVERY]";
export const EXCEPTION_KINDS = ["short", "no_show", "price_dispute", "failed", "other"];
/** Foodservice floor for buyer UI / book validation when lot has no stricter min. */
export const FOODSERVICE_MIN_BIRDS = 10;
export const HANDSHAKE_PHASES = [
  "awaiting_payment",
  "reserved",
  "planned",
  "buyer_confirmed",
  "farmer_confirmed",
  "settled",
  "exception",
  "failed",
  "cancelled",
];

const WEIGHT_VARIANCE = 0.08;
const PRICE_VARIANCE = 0.01;
const PRICE_ABS_RW = 50;

export function fulfillmentMigrationMessage() {
  return "Apply migration 067_market_fulfillment.sql to enable the fulfillment handshake.";
}

export function isMissingFulfillmentColumn(err) {
  const code = err && typeof err === "object" ? err.code : "";
  const msg = err instanceof Error ? err.message : String(err || "");
  return code === "42703" || /column .* does not exist/i.test(msg);
}

export function normalizeCollectOrDelivery(value) {
  const v = String(value || "").trim().toLowerCase();
  return COLLECT_OR_DELIVERY.includes(v) ? v : null;
}

export function normalizeSlaughterMode(value) {
  const v = String(value || "").trim().toLowerCase();
  return SLAUGHTER_MODES.includes(v) ? v : null;
}

export function normalizeDeliveryActor(value) {
  const v = String(value || "").trim().toLowerCase();
  return DELIVERY_ACTORS.includes(v) ? v : null;
}

/**
 * Resolve who moves birds. Collect always → buyer.
 * Self-serve delivery → farm. Cleva only when allowCleva (ops).
 */
export function resolveDeliveryActor(collectOrDelivery, deliveryActor, { allowCleva = false } = {}) {
  const collect = normalizeCollectOrDelivery(collectOrDelivery);
  if (collect !== "delivery") return "buyer";
  const actor = normalizeDeliveryActor(deliveryActor);
  if (actor === "cleva") return allowCleva ? "cleva" : "farm";
  if (actor === "farm") return "farm";
  return "farm";
}

export function appendNeedDeliveryNote(existing) {
  const base = existing != null ? String(existing) : "";
  if (base.includes(NEED_CLEVA_DELIVERY_MARKER)) return base;
  const tip = `${NEED_CLEVA_DELIVERY_MARKER} Buyer asked for Cleva delivery help.`;
  return base.trim() ? `${base.trim()}\n${tip}` : tip;
}

export function notesNeedClevaDelivery(notes) {
  return String(notes || "").includes(NEED_CLEVA_DELIVERY_MARKER);
}

export function normalizeExceptionKind(value) {
  const v = String(value || "").trim().toLowerCase();
  return EXCEPTION_KINDS.includes(v) ? v : null;
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  const n = numOrNull(v);
  if (n == null) return null;
  return Math.round(n);
}

export function exceptionIsOpen(match) {
  const kind = String(match?.exceptionKind || "none");
  return kind !== "none" && !match?.exceptionResolvedAt;
}

export function isBuyerPaid(match) {
  const pay = String(match?.buyerPaymentStatus || match?.buyer_payment_status || "paid");
  return pay === "paid";
}

export function handshakePhase(match) {
  const status = String(match?.status || "committed");
  if (status === "cancelled") return "cancelled";
  if (status === "failed") return "failed";
  if (exceptionIsOpen(match)) return "exception";
  if (!isBuyerPaid(match) && status === "committed") return "awaiting_payment";
  if (status === "delivered" || (match?.buyerConfirmedAt && match?.farmerConfirmedAt)) {
    return "settled";
  }
  if (match?.buyerConfirmedAt && !match?.farmerConfirmedAt) return "buyer_confirmed";
  if (match?.farmerConfirmedAt && !match?.buyerConfirmedAt) return "farmer_confirmed";
  if (
    match?.logisticsPlannedAt ||
    match?.collectOrDelivery ||
    match?.slaughterMode ||
    match?.fulfillWindowStart
  ) {
    return "planned";
  }
  return "reserved";
}

export function normalizeActuals(input, match) {
  const birds = intOrNull(input?.actualBirds);
  const weight = numOrNull(input?.actualWeightKg);
  const price = numOrNull(input?.actualPricePerKg);
  return {
    actualBirds: birds != null && birds >= 0 ? birds : intOrNull(match?.actualBirds) ?? intOrNull(match?.birds),
    actualWeightKg:
      weight != null && weight > 0
        ? weight
        : numOrNull(match?.actualWeightKg) ?? numOrNull(match?.avgWeightKg),
    actualPricePerKg:
      price != null && price >= 0
        ? price
        : numOrNull(match?.actualPricePerKg) ?? numOrNull(match?.agreedPricePerKg),
  };
}

export function detectActualsConflict(existing, incoming) {
  if (!existing || !incoming) return null;
  if (
    existing.actualBirds != null &&
    incoming.actualBirds != null &&
    Number(existing.actualBirds) !== Number(incoming.actualBirds)
  ) {
    return {
      kind: Number(incoming.actualBirds) < Number(existing.actualBirds) ? "short" : "other",
      field: "birds",
    };
  }
  const w1 = numOrNull(existing.actualWeightKg);
  const w2 = numOrNull(incoming.actualWeightKg);
  if (w1 != null && w2 != null && w1 > 0) {
    if (Math.abs(w1 - w2) / w1 > WEIGHT_VARIANCE) {
      return { kind: "short", field: "weight" };
    }
  }
  const p1 = numOrNull(existing.actualPricePerKg);
  const p2 = numOrNull(incoming.actualPricePerKg);
  if (p1 != null && p2 != null && p1 > 0) {
    const abs = Math.abs(p1 - p2);
    if (abs > PRICE_ABS_RW && abs / p1 > PRICE_VARIANCE) {
      return { kind: "price_dispute", field: "price" };
    }
  }
  return null;
}

export function storedActuals(match) {
  return {
    actualBirds: intOrNull(match?.actualBirds) ?? intOrNull(match?.birds),
    actualWeightKg: numOrNull(match?.actualWeightKg) ?? numOrNull(match?.avgWeightKg),
    actualPricePerKg: numOrNull(match?.actualPricePerKg) ?? numOrNull(match?.agreedPricePerKg),
  };
}

export function commissionInputs(match, actuals) {
  const merged = normalizeActuals(actuals || {}, match);
  return {
    birds: merged.actualBirds,
    avgWeightKg: merged.actualWeightKg,
    agreedPricePerKg: merged.actualPricePerKg,
    expectedWeightKg: match?.expectedWeightKg,
    askPricePerKg: match?.askPricePerKg,
  };
}

export function applyPlanLogistics(match, plan, userId, nowIso) {
  const phase = handshakePhase(match);
  if (phase === "awaiting_payment") {
    return { error: "Buyer must pay Cleva before handover can be planned." };
  }
  if (phase === "cancelled" || phase === "failed" || phase === "settled") {
    return { error: `Cannot plan logistics from ${phase}.` };
  }
  if (phase === "exception") {
    return { error: "Resolve the open exception before changing logistics." };
  }
  const collect = normalizeCollectOrDelivery(plan?.collectOrDelivery);
  const slaughter = normalizeSlaughterMode(plan?.slaughterMode);
  if (plan?.collectOrDelivery && !collect) {
    return { error: "collectOrDelivery must be collect or delivery." };
  }
  if (plan?.slaughterMode && !slaughter) {
    return { error: "slaughterMode must be farm, buyer, or none." };
  }
  if (plan?.deliveryActor != null && plan.deliveryActor !== "" && !normalizeDeliveryActor(plan.deliveryActor)) {
    return { error: "deliveryActor must be buyer, farm, or cleva." };
  }
  const allowCleva = Boolean(plan?.allowCleva);
  if (normalizeDeliveryActor(plan?.deliveryActor) === "cleva" && !allowCleva) {
    return { error: "Only ops can set Cleva delivery." };
  }
  const nextCollect = collect ?? match.collectOrDelivery ?? null;
  const requestedActor =
    plan?.deliveryActor !== undefined ? plan.deliveryActor : match.deliveryActor;
  const nextActor = resolveDeliveryActor(nextCollect, requestedActor, { allowCleva });
  if (nextCollect === "delivery" && nextActor === "buyer") {
    return { error: "delivery requires deliveryActor farm or cleva." };
  }
  let notes =
    plan?.logisticsNotes !== undefined ? plan.logisticsNotes : match.logisticsNotes ?? null;
  if (plan?.needClevaDelivery) {
    notes = appendNeedDeliveryNote(notes);
  }
  return {
    patch: {
      collectOrDelivery: nextCollect,
      slaughterMode: slaughter ?? match.slaughterMode ?? null,
      deliveryActor: nextActor,
      fulfillWindowStart: plan?.fulfillWindowStart || match.fulfillWindowStart || null,
      fulfillWindowEnd: plan?.fulfillWindowEnd || match.fulfillWindowEnd || null,
      logisticsNotes: notes,
      logisticsPlannedAt: match.logisticsPlannedAt || nowIso,
      logisticsPlannedBy: match.logisticsPlannedBy || userId || null,
    },
  };
}

export function applySideConfirm(match, side, actuals, userId, nowIso) {
  if (side !== "buyer" && side !== "farmer") {
    return { error: "side must be buyer or farmer." };
  }
  const phase = handshakePhase(match);
  if (phase === "awaiting_payment") {
    return { error: "Buyer must pay Cleva before the order can be confirmed." };
  }
  if (phase === "cancelled" || phase === "failed" || phase === "settled") {
    return { error: `Cannot confirm from ${phase}.` };
  }
  if (phase === "exception") {
    return { error: "Resolve the open exception before confirming." };
  }
  if (String(match?.status || "") !== "committed") {
    return { error: `Cannot confirm from status ${match?.status}.` };
  }
  const already = side === "buyer" ? match.buyerConfirmedAt : match.farmerConfirmedAt;
  if (already) {
    return { error: "You already confirmed this trade." };
  }
  const incoming = normalizeActuals(actuals, match);
  const otherConfirmed = side === "buyer" ? match.farmerConfirmedAt : match.buyerConfirmedAt;
  const patch = {
    actualBirds: incoming.actualBirds,
    actualWeightKg: incoming.actualWeightKg,
    actualPricePerKg: incoming.actualPricePerKg,
    buyerConfirmedAt: side === "buyer" ? nowIso : match.buyerConfirmedAt || null,
    buyerConfirmedBy: side === "buyer" ? userId : match.buyerConfirmedBy || null,
    farmerConfirmedAt: side === "farmer" ? nowIso : match.farmerConfirmedAt || null,
    farmerConfirmedBy: side === "farmer" ? userId : match.farmerConfirmedBy || null,
  };
  if (otherConfirmed) {
    const conflict = detectActualsConflict(storedActuals(match), incoming);
    if (conflict) {
      return {
        settle: false,
        conflict,
        patch: {
          ...patch,
          buyerConfirmedAt: side === "buyer" ? null : match.buyerConfirmedAt,
          buyerConfirmedBy: side === "buyer" ? null : match.buyerConfirmedBy,
          farmerConfirmedAt: side === "farmer" ? null : match.farmerConfirmedAt,
          farmerConfirmedBy: side === "farmer" ? null : match.farmerConfirmedBy,
          actualBirds: match.actualBirds ?? storedActuals(match).actualBirds,
          actualWeightKg: match.actualWeightKg ?? storedActuals(match).actualWeightKg,
          actualPricePerKg: match.actualPricePerKg ?? storedActuals(match).actualPricePerKg,
          exceptionKind: conflict.kind,
          exceptionNotes: `Conflicting ${conflict.field} at confirm.`,
          exceptionOpenedAt: nowIso,
          exceptionOpenedBy: userId,
        },
      };
    }
    return { settle: true, patch: { ...patch, status: "delivered" } };
  }
  return { settle: false, patch };
}

export function applyOpenException(match, kind, notes, userId, nowIso) {
  const normalized = normalizeExceptionKind(kind);
  if (!normalized) {
    return { error: "exception kind is required." };
  }
  const phase = handshakePhase(match);
  if (phase === "settled" || phase === "cancelled") {
    return { error: `Cannot open an exception from ${phase}.` };
  }
  if (phase === "exception") {
    return { error: "An exception is already open." };
  }
  if (String(match?.status || "") !== "committed") {
    return { error: `Cannot open an exception from status ${match?.status}.` };
  }
  return {
    patch: {
      exceptionKind: normalized,
      exceptionNotes: notes || null,
      exceptionOpenedAt: nowIso,
      exceptionOpenedBy: userId,
      exceptionResolvedAt: null,
      exceptionResolvedBy: null,
      status: normalized === "failed" ? "failed" : match.status,
    },
    failed: normalized === "failed",
  };
}

export function applyResolveException(match, action, actuals, notes, userId, nowIso) {
  if (!exceptionIsOpen(match) && handshakePhase(match) !== "failed") {
    return { error: "No open exception to resolve." };
  }
  const act = String(action || "").trim().toLowerCase();
  if (act === "reopen") {
    return {
      patch: {
        exceptionKind: "none",
        exceptionNotes: notes || match.exceptionNotes || null,
        exceptionResolvedAt: nowIso,
        exceptionResolvedBy: userId,
        status: "committed",
      },
    };
  }
  if (act === "fail") {
    return {
      failed: true,
      patch: {
        exceptionKind: match.exceptionKind === "none" ? "failed" : match.exceptionKind,
        exceptionNotes: notes || match.exceptionNotes || null,
        exceptionResolvedAt: nowIso,
        exceptionResolvedBy: userId,
        status: "failed",
      },
    };
  }
  if (act === "settle") {
    const incoming = normalizeActuals(actuals, match);
    return {
      settle: true,
      patch: {
        ...incoming,
        buyerConfirmedAt: match.buyerConfirmedAt || nowIso,
        buyerConfirmedBy: match.buyerConfirmedBy || userId,
        farmerConfirmedAt: match.farmerConfirmedAt || nowIso,
        farmerConfirmedBy: match.farmerConfirmedBy || userId,
        exceptionResolvedAt: nowIso,
        exceptionResolvedBy: userId,
        status: "delivered",
      },
    };
  }
  return { error: "action must be settle, fail, or reopen." };
}

export function applyOpsSettle(match, actuals, userId, nowIso) {
  const phase = handshakePhase(match);
  if (phase === "cancelled") return { error: "Cannot settle a cancelled trade." };
  if (phase === "failed") return { error: "Failed trades must be reopened before settle." };
  const incoming = normalizeActuals(actuals, match);
  return {
    settle: true,
    patch: {
      ...incoming,
      buyerConfirmedAt: match.buyerConfirmedAt || nowIso,
      buyerConfirmedBy: match.buyerConfirmedBy || userId,
      farmerConfirmedAt: match.farmerConfirmedAt || nowIso,
      farmerConfirmedBy: match.farmerConfirmedBy || userId,
      exceptionKind: match.exceptionKind && match.exceptionKind !== "none" ? match.exceptionKind : "none",
      exceptionResolvedAt: exceptionIsOpen(match) ? nowIso : match.exceptionResolvedAt || null,
      exceptionResolvedBy: exceptionIsOpen(match) ? userId : match.exceptionResolvedBy || null,
      status: "delivered",
    },
  };
}

export function projectFulfillmentContacts(match, viewer) {
  const isOps = viewer === "ops";
  const discloseContact = Boolean(match?.discloseContact);
  const discloseLocation = Boolean(match?.discloseExactLocation);
  return {
    buyerPhone: isOps || viewer === "farmer" ? match?.buyerPhone || match?.buyerWhatsapp || null : null,
    buyerWhatsapp: isOps || viewer === "farmer" ? match?.buyerWhatsapp || null : null,
    farmPhone:
      isOps || viewer === "farmer" || (viewer === "buyer" && discloseContact)
        ? match?.farmPhone || match?.lotContactPhone || null
        : null,
    farmExactLocation:
      isOps || (viewer === "buyer" && discloseLocation) ? match?.farmExactLocation || null : null,
  };
}

export const FULFILLMENT_SELECT = `
  m.id::text AS id,
  m.lot_id::text AS "lotId",
  m.buyer_id::text AS "buyerId",
  m.birds,
  m.agreed_price_per_kg AS "agreedPricePerKg",
  m.ready_date AS "readyDate",
  m.status,
  m.transport_notes AS "transportNotes",
  m.slaughter_notes AS "slaughterNotes",
  m.learning_notes AS "learningNotes",
  m.commission_status AS "commissionStatus",
  m.commission_amount_rwf AS "commissionAmountRwf",
  m.commission_vet_user_id::text AS "commissionVetUserId",
  m.created_at AS "createdAt",
  m.updated_at AS "updatedAt",
  m.collect_or_delivery AS "collectOrDelivery",
  m.slaughter_mode AS "slaughterMode",
  m.delivery_actor AS "deliveryActor",
  m.fulfill_window_start AS "fulfillWindowStart",
  m.fulfill_window_end AS "fulfillWindowEnd",
  m.logistics_notes AS "logisticsNotes",
  m.logistics_planned_at AS "logisticsPlannedAt",
  m.logistics_planned_by::text AS "logisticsPlannedBy",
  m.actual_birds AS "actualBirds",
  m.actual_weight_kg AS "actualWeightKg",
  m.actual_price_per_kg AS "actualPricePerKg",
  m.buyer_confirmed_at AS "buyerConfirmedAt",
  m.buyer_confirmed_by::text AS "buyerConfirmedBy",
  m.farmer_confirmed_at AS "farmerConfirmedAt",
  m.farmer_confirmed_by::text AS "farmerConfirmedBy",
  m.exception_kind AS "exceptionKind",
  m.exception_notes AS "exceptionNotes",
  m.exception_opened_at AS "exceptionOpenedAt",
  m.exception_opened_by::text AS "exceptionOpenedBy",
  m.exception_resolved_at AS "exceptionResolvedAt",
  m.exception_resolved_by::text AS "exceptionResolvedBy",
  b.name AS "buyerName",
  b.phone AS "buyerPhone",
  b.whatsapp AS "buyerWhatsapp",
  b.user_id::text AS "buyerUserId",
  l.farm_label AS "lotFarmLabel",
  l.district AS "lotDistrict",
  l.avg_weight_kg AS "avgWeightKg",
  l.expected_weight_kg AS "expectedWeightKg",
  l.ask_price_per_kg AS "askPricePerKg",
  l.ready_from AS "lotReadyFrom",
  l.ready_to AS "lotReadyTo",
  l.source AS "lotSource",
  l.flock_id::text AS "flockId",
  l.company_id::text AS "lotCompanyId",
  l.listed_by::text AS "listedBy",
  l.farm_profile_id::text AS "farmProfileId",
  l.contact_phone AS "lotContactPhone",
  l.farmer_can_slaughter AS "farmerCanSlaughter",
  l.delivery_available AS "deliveryAvailable",
  l.min_order_birds AS "minOrderBirds",
  l.public_ref AS "publicRef",
  l.scouted_by::text AS "scoutedBy",
  m.buyer_payment_status AS "buyerPaymentStatus",
  m.buyer_paid_at AS "buyerPaidAt",
  m.buyer_paid_rwf AS "buyerPaidRwf",
  m.buyer_payment_ref AS "buyerPaymentRef",
  m.farmer_payout_status AS "farmerPayoutStatus",
  m.farmer_paid_at AS "farmerPaidAt",
  m.farmer_paid_rwf AS "farmerPaidRwf",
  m.farmer_payout_ref AS "farmerPayoutRef",
  m.quote_json AS "quoteJson",
  m.farm_gate_per_kg AS "farmGatePerKg",
  m.buyer_price_per_kg AS "buyerPricePerKg",
  fp.contact_phone AS "farmPhone",
  fp.exact_location AS "farmExactLocation",
  fp.disclose_contact AS "discloseContact",
  fp.disclose_exact_location AS "discloseExactLocation",
  fp.display_name AS "farmDisplayName"
`;

export function mapFulfillmentJob(row, viewer) {
  const contacts = projectFulfillmentContacts(row, viewer);
  return {
    ...row,
    handshake: handshakePhase(row),
    needClevaDelivery: notesNeedClevaDelivery(row.logisticsNotes),
    buyerPhone: contacts.buyerPhone,
    buyerWhatsapp: contacts.buyerWhatsapp,
    farmPhone: contacts.farmPhone,
    farmExactLocation: contacts.farmExactLocation,
  };
}
