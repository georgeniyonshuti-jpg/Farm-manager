/** Shared live-vs-slaughter × collect-vs-delivery defaults for market UX. */

export type MarketProcess = "live" | "slaughter";
export type MarketHandover = "collect" | "delivery";
export type DeliveryActor = "buyer" | "farm" | "cleva";

/** Foodservice floor — kitchens from 10; ranked MOQ stays 50 on the server. */
export const FOODSERVICE_MIN_BIRDS = 10;

export function defaultProcess(opts: {
  slaughterAvailable?: boolean;
  tripSlaughterPayer?: "butcher" | "farm" | null;
}): MarketProcess {
  // Trip that explicitly asked for live (farm pays slaughter / none) stays live.
  if (opts.tripSlaughterPayer === "farm") return "live";
  // Prefer live for Rwanda board; slaughter is opt-in even when the farm can.
  return "live";
}

export function defaultHandover(opts: {
  process: MarketProcess;
  deliveryAvailable?: boolean;
  tripDelivery?: boolean;
}): MarketHandover {
  if (opts.tripDelivery === true && opts.deliveryAvailable) return "delivery";
  if (opts.process === "slaughter" && opts.deliveryAvailable) return "delivery";
  return "collect";
}

/** Self-serve delivery is only offered when the farm opted into farm delivery. */
export function deliveryOptionEnabled(opts: {
  deliveryAvailable?: boolean;
}): boolean {
  return Boolean(opts.deliveryAvailable);
}

export function resolveDeliveryActor(opts: {
  collectOrDelivery: MarketHandover | string | null | undefined;
  deliveryActor?: DeliveryActor | string | null;
  /** Ops may set cleva; buyers/farmers never self-serve it. */
  allowCleva?: boolean;
}): DeliveryActor {
  const handover = String(opts.collectOrDelivery || "").toLowerCase();
  if (handover !== "delivery") return "buyer";
  const actor = String(opts.deliveryActor || "").toLowerCase();
  if (actor === "cleva" && opts.allowCleva) return "cleva";
  if (actor === "farm" || actor === "cleva") return actor === "cleva" && opts.allowCleva ? "cleva" : "farm";
  return "farm";
}

export function buyerBirdsFloor(lotMinOrder?: number | null): number {
  const lotMin = lotMinOrder != null && Number.isFinite(lotMinOrder) ? Math.round(Number(lotMinOrder)) : null;
  if (lotMin != null && lotMin > 0) return Math.max(FOODSERVICE_MIN_BIRDS, lotMin);
  return FOODSERVICE_MIN_BIRDS;
}
