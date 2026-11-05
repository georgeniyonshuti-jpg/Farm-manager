/**
 * Butcher shop order status. Every route that changes an order asks this
 * module first. Pure: no database, no clock unless `now` is passed.
 *
 * placed -> payment_pending -> paid -> accepted -> ready -> out_for_delivery -> delivered
 * placed -> expired (unpaid too long). payment_pending -> placed (ops rejects the payment).
 * Before delivered, ops can cancel. delivered -> problem -> resolved.
 */

export const SHOP_ORDER_STATUSES = [
  "placed",
  "payment_pending",
  "paid",
  "accepted",
  "ready",
  "out_for_delivery",
  "delivered",
  "problem",
  "resolved",
  "cancelled",
  "expired",
];

export const PROBLEM_KINDS = ["short", "wrong", "late", "quality", "other"];

const CANCELLABLE = new Set(["placed", "payment_pending", "paid", "accepted", "ready", "out_for_delivery"]);
const REASSIGNABLE = new Set(["paid", "accepted", "ready"]);

/** Butcher steps. Ops may also take them, for orders handled by phone. */
const BUTCHER_STEPS = {
  accept: { from: "paid", to: "accepted", stamp: "acceptedAt" },
  ready: { from: "accepted", to: "ready", stamp: "readyAt" },
  out: { from: "ready", to: "out_for_delivery", stamp: "outAt", delivery: true },
  delivered: { from: "out_for_delivery", to: "delivered", stamp: "deliveredAt", delivery: true },
  // A pickup order: the customer collected it at the kitchen.
  collected: { from: "ready", to: "delivered", stamp: "deliveredAt", pickup: true },
};

function fail(code, error) {
  return { ok: false, code, error };
}

function ok(to, extra = {}) {
  return { ok: true, to, ...extra };
}

/**
 * @param {{ status: string, butcherId?: string | null, paymentStatus?: string }} order
 * @param {string} action
 * @param {{ kind: "customer" | "butcher" | "ops" | "system", butcherId?: string }} actor
 * @param {{ problemKind?: string, reason?: string, butcherId?: string }} [input]
 */
export function nextShopOrderStatus(order, action, actor, input = {}) {
  const status = order?.status;
  if (!SHOP_ORDER_STATUSES.includes(status)) return fail("bad_status", "Unknown order status.");
  const kind = actor?.kind;

  // A butcher never learns that another butcher's order exists.
  if (kind === "butcher") {
    if (!actor.butcherId || order.butcherId !== actor.butcherId) return fail("not_found", "Order not found.");
    if (!BUTCHER_STEPS[action]) return fail("forbidden", "Butchers cannot do that.");
  }

  if (BUTCHER_STEPS[action]) {
    if (kind !== "butcher" && kind !== "ops") return fail("forbidden", "Not allowed.");
    const step = BUTCHER_STEPS[action];
    if (!order.butcherId) return fail("unassigned", "No butcher is assigned to this order.");
    const pickup = order.fulfilment === "pickup";
    if (step.delivery && pickup) return fail("wrong_status", "This order is collected, not delivered.");
    if (step.pickup && !pickup) return fail("wrong_status", "This order is delivered, not collected.");
    if (status !== step.from) return fail("wrong_status", `Order is ${status}, not ${step.from}.`);
    return ok(step.to, { stamp: step.stamp });
  }

  switch (action) {
    case "pay_sent":
      if (kind !== "customer" && kind !== "ops") return fail("forbidden", "Not allowed.");
      if (status !== "placed") return fail("wrong_status", "This order is not waiting for payment.");
      return ok("payment_pending", { paymentStatus: "pending" });

    case "confirm_payment":
      if (kind !== "ops") return fail("forbidden", "Only ops can confirm a payment.");
      if (status !== "payment_pending") return fail("wrong_status", "No payment is waiting on this order.");
      return ok("paid", { paymentStatus: "paid" });

    case "reject_payment":
      if (kind !== "ops") return fail("forbidden", "Only ops can reject a payment.");
      if (status !== "payment_pending") return fail("wrong_status", "No payment is waiting on this order.");
      return ok("placed", { paymentStatus: "unpaid" });

    case "assign":
      if (kind !== "ops" && kind !== "system") return fail("forbidden", "Only ops can assign a butcher.");
      if (!REASSIGNABLE.has(status)) return fail("wrong_status", "This order can no longer change butcher.");
      if (!input.butcherId) return fail("bad_input", "Choose a butcher.");
      // A new butcher starts from the top: they must accept it themselves.
      return ok("paid", { butcherId: input.butcherId });

    case "cancel": {
      if (kind !== "ops") return fail("forbidden", "Only ops can cancel an order.");
      if (!CANCELLABLE.has(status)) return fail("wrong_status", "This order can no longer be cancelled.");
      const reason = String(input.reason || "").trim();
      if (!reason) return fail("bad_input", "Give a reason for cancelling.");
      const paid = order.paymentStatus === "paid";
      return ok("cancelled", { stamp: "cancelledAt", needsRefund: paid });
    }

    case "expire":
      if (kind !== "system" && kind !== "ops") return fail("forbidden", "Not allowed.");
      if (status !== "placed") return fail("wrong_status", "Only unpaid orders expire.");
      return ok("expired");

    case "report_problem":
      if (kind !== "customer" && kind !== "ops") return fail("forbidden", "Not allowed.");
      if (status !== "delivered") return fail("wrong_status", "A problem can be reported after delivery.");
      if (!PROBLEM_KINDS.includes(input.problemKind)) return fail("bad_input", "Choose what went wrong.");
      return ok("problem");

    case "resolve":
      if (kind !== "ops") return fail("forbidden", "Only ops can resolve a problem.");
      if (status !== "problem") return fail("wrong_status", "This order has no open problem.");
      return ok("resolved");

    default:
      return fail("unknown_action", "Unknown action.");
  }
}

function minutesSince(iso, now) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return (now.getTime() - t) / 60000;
}

/** Unpaid for longer than the shop allows. Only `placed` orders expire. */
export function isPaymentOverdue(order, payWithinMinutes, now = new Date()) {
  return order?.status === "placed" && minutesSince(order.placedAt, now) > payWithinMinutes;
}

/**
 * Paid but not accepted in time. Counted from payment confirmation, because
 * the butcher only sees the order once it is paid.
 */
export function isAcceptLate(order, acceptWithinMinutes, now = new Date()) {
  if (order?.status !== "paid") return false;
  const from = order.paidConfirmedAt || order.placedAt;
  return minutesSince(from, now) > acceptWithinMinutes;
}
