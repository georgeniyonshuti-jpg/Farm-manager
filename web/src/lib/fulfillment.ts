export type HandshakePhase =
  | "awaiting_payment"
  | "reserved"
  | "planned"
  | "buyer_confirmed"
  | "farmer_confirmed"
  | "settled"
  | "exception"
  | "failed"
  | "cancelled";

export type FulfillmentViewer = "buyer" | "farmer" | "ops";

export const HANDSHAKE_LABEL: Record<HandshakePhase, string> = {
  awaiting_payment: "Awaiting payment",
  reserved: "Reserved",
  planned: "Handover planned",
  buyer_confirmed: "Buyer confirmed",
  farmer_confirmed: "Farm confirmed",
  settled: "Settled",
  exception: "Needs ops",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const EXCEPTION_LABEL: Record<string, string> = {
  short: "Short count / weight",
  no_show: "No-show",
  price_dispute: "Price dispute",
  failed: "Failed trade",
  other: "Other",
};

export function handshakeTone(
  phase: HandshakePhase
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (phase === "settled") return "success";
  if (phase === "exception" || phase === "awaiting_payment") return "warning";
  if (phase === "failed" || phase === "cancelled") return "danger";
  if (phase === "buyer_confirmed" || phase === "farmer_confirmed" || phase === "planned") return "info";
  return "neutral";
}

export function handshakeSteps(phase: HandshakePhase): Array<{ key: HandshakePhase; done: boolean }> {
  const order: HandshakePhase[] = [
    "awaiting_payment",
    "reserved",
    "planned",
    "buyer_confirmed",
    "farmer_confirmed",
    "settled",
  ];
  if (phase === "exception" || phase === "failed" || phase === "cancelled") {
    return order.map((key) => ({ key, done: false }));
  }
  const idx = order.indexOf(phase);
  return order.map((key, i) => ({
    key,
    done: i <= Math.max(idx, 0) || (phase === "settled" && i <= 5),
  }));
}

export function viewerNeedsConfirm(phase: HandshakePhase, viewer: FulfillmentViewer): boolean {
  if (
    phase === "exception" ||
    phase === "settled" ||
    phase === "failed" ||
    phase === "cancelled" ||
    phase === "awaiting_payment"
  ) {
    return false;
  }
  if (viewer === "ops") return true;
  if (viewer === "buyer") return phase !== "buyer_confirmed";
  return phase !== "farmer_confirmed";
}

export function logisticsLabel(
  collect?: string | null,
  slaughter?: string | null,
  deliveryActor?: string | null
): string {
  const bits = [];
  if (collect === "collect") bits.push("Buyer collects");
  if (collect === "delivery") {
    if (deliveryActor === "cleva") bits.push("Cleva delivery");
    else bits.push("Farm delivers");
  }
  if (slaughter === "farm") bits.push("Slaughter at farm");
  if (slaughter === "buyer") bits.push("Slaughter at buyer");
  if (slaughter === "none") bits.push("Live birds");
  return bits.join(" · ") || "Handover not planned";
}
