import { API_BASE_URL } from "./config";
import type { ShopCategory } from "../lib/marketSections";

export type { ShopCategory };
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";

export type ShopSettings = {
  commissionPct: number;
  minOrderRwf: number;
  minOrderItems: number;
  payWithinMinutes: number;
  acceptWithinMinutes: number;
  isOpen: boolean;
  closedMessage: string;
  openTime: string;
  closeTime: string;
  updatedAt?: string;
};

export type ShopProduct = {
  id: string;
  sku: string;
  name: string;
  nameRw: string;
  description: string;
  descriptionRw: string;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  priceRwf: number;
  photoUrl: string | null;
  category: ShopCategory;
  active: boolean;
  sortOrder: number;
};

export type ShopZone = {
  id: string;
  name: string;
  district: string;
  sectors: string[];
  deliveryFeeRwf: number;
  freeDeliveryOverRwf: number | null;
  active: boolean;
};

export type ButcherStatus = "pending" | "active" | "paused" | "ended";

export type ShopButcher = {
  id: string;
  userId: string | null;
  shopName: string;
  ownerName: string;
  phone: string;
  whatsapp: string | null;
  district: string | null;
  sector: string | null;
  addressNote: string;
  licenceRef: string;
  momoPayoutPhone: string | null;
  momoPayoutName: string;
  status: ButcherStatus;
  notes: string;
  loginEmail: string | null;
  zones: Array<{ zoneId: string; priority: number }>;
};

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type KitchenHours = Record<Weekday, { open: string; close: string } | null>;

/** A BigChix kitchen: a partner like a butcher, plus kitchen settings and the dishes it makes. */
export type ShopKitchen = Omit<ShopButcher, "userId"> & {
  hours: KitchenHours;
  prepMinutes: number;
  maxOpenOrders: number;
  takingOrders: boolean;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupDirections: string;
  /** feeRwf = what Cleva pays the kitchen for one of this dish. */
  dishes: Array<{ productId: string; feeRwf: number; soldOutOn?: string | null }>;
};

export type ShopSetup = {
  settings: ShopSettings | null;
  products: ShopProduct[];
  zones: ShopZone[];
  butchers: ShopButcher[];
  kitchens?: ShopKitchen[];
  openBlockers: string[];
};

const BASE = `${API_BASE_URL}/api/shop/desk`;

async function sendJson<T>(url: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? jsonAuthHeaders(token) : readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not complete that.");
  return data as T;
}

function save<T>(token: string | null, path: string, id: string | null, body: unknown) {
  return sendJson<T>(id ? `${BASE}${path}/${encodeURIComponent(id)}` : `${BASE}${path}`, token, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(body),
  });
}

export function fetchShopSetup(token: string | null) {
  return sendJson<ShopSetup>(`${BASE}/setup`, token);
}

export function saveShopSettings(token: string | null, body: ShopSettings) {
  return sendJson<{ settings: ShopSettings }>(`${BASE}/settings`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function saveShopProduct(token: string | null, id: string | null, body: Omit<ShopProduct, "id">) {
  return save<{ product: ShopProduct }>(token, "/products", id, body);
}

/** Upload a resized item photo; returns the link to store on the item. */
export function uploadShopPhoto(token: string | null, dataBase64: string) {
  return sendJson<{ photoUrl: string }>(`${BASE}/photos`, token, {
    method: "POST",
    body: JSON.stringify({ dataBase64 }),
  });
}

/** Item photos uploaded here are stored as API paths; make them loadable from any site. */
export function shopPhotoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}

export function saveShopZone(token: string | null, id: string | null, body: Omit<ShopZone, "id">) {
  return save<{ zone: ShopZone }>(token, "/zones", id, body);
}

export function saveShopButcher(token: string | null, id: string | null, body: Omit<ShopButcher, "id" | "userId">) {
  return save<{ butcher: ShopButcher }>(token, "/butchers", id, body);
}

export function saveShopKitchen(token: string | null, id: string | null, body: Omit<ShopKitchen, "id">) {
  return save<{ kitchen: ShopKitchen }>(token, "/kitchens", id, body);
}

// ---------- public shop (no login) ----------

const PUBLIC = `${API_BASE_URL}/api/market/shop`;

export type ShopCatalogProduct = {
  sku: string;
  name: string;
  nameRw: string;
  description: string;
  descriptionRw: string;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  priceRwf: number;
  photoUrl: string | null;
  category: ShopCategory;
  /** False for BigChix dishes until kitchens can take orders (shown in preview only). */
  orderable?: boolean;
};

export type ShopCatalog = {
  open: boolean;
  closedReason: "closed" | "hours" | null;
  closedMessage: string;
  openTime: string | null;
  closeTime: string | null;
  minOrderRwf: number;
  minOrderItems: number;
  products: ShopCatalogProduct[];
  zones: Array<{
    name: string;
    district: string;
    sectors: string[];
    deliveryFeeRwf: number;
    freeDeliveryOverRwf: number | null;
  }>;
};

export type CartItem = { sku: string; qty: number };

export type ShopQuote = {
  ok: boolean;
  code?: string;
  error?: string;
  lines?: Array<{ sku: string; name: string; qty: number; unitPriceRwf: number; lineTotalRwf: number }>;
  itemCount?: number;
  subtotalRwf?: number;
  deliveryFeeRwf?: number;
  totalRwf?: number;
  deliveryPaidBy?: "customer" | "cleva";
  freeDeliveryOverRwf?: number | null;
  amountToFreeDeliveryRwf?: number | null;
  minOrderRwf?: number;
  minOrderItems?: number;
};

export type ShopOrderStatus =
  | "placed"
  | "payment_pending"
  | "paid"
  | "accepted"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "problem"
  | "resolved"
  | "cancelled"
  | "expired";

export type PublicShopOrder = {
  ref: string;
  status: ShopOrderStatus;
  paymentStatus: string;
  paymentSent: boolean;
  firstName: string;
  district: string;
  sector: string;
  lines: Array<{
    name: string;
    qty: number;
    unitPriceRwf: number;
    lineTotalRwf: number;
    weightMinKg: number | null;
    weightMaxKg: number | null;
  }>;
  subtotalRwf: number;
  deliveryFeeRwf: number;
  totalRwf: number;
  payToPhone: string | null;
  payBy: string | null;
  placedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  outAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
};

export type PlaceOrderBody = {
  customerName: string;
  phone: string;
  district: string;
  sector: string;
  addressNote: string;
  items: CartItem[];
  website?: string;
  formStartedAt?: number;
};

async function publicJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not complete that.");
  return data as T;
}

export function fetchShopCatalog({ preview = false }: { preview?: boolean } = {}) {
  return publicJson<ShopCatalog>(`${PUBLIC}/catalog${preview ? "?preview=1" : ""}`);
}

export function quoteShopCart(body: { items: CartItem[]; district: string; sector: string }) {
  return publicJson<{ quote: ShopQuote }>(`${PUBLIC}/quote`, { method: "POST", body: JSON.stringify(body) });
}

export function placeShopOrder(body: PlaceOrderBody) {
  return publicJson<{ ref: string; token: string }>(`${PUBLIC}/orders${window.location.search}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchShopOrder(ref: string, token: string) {
  return publicJson<{ order: PublicShopOrder }>(
    `${PUBLIC}/orders/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`
  );
}

export function sendShopPayment(ref: string, token: string, body: { momoTxnId: string; payerPhone?: string }) {
  return publicJson<{ status: ShopOrderStatus }>(
    `${PUBLIC}/orders/${encodeURIComponent(ref)}/pay?t=${encodeURIComponent(token)}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

// ---------- desk orders ----------

export type DeskOrderView = "to_confirm" | "open" | "done" | "all";

export type DeskShopOrder = {
  id: string;
  ref: string;
  status: ShopOrderStatus;
  /** "kitchen" = a BigChix dish order; butcherId/butcherName then name the kitchen. */
  channel?: "fresh" | "kitchen";
  fulfilment?: "delivery" | "pickup";
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  district: string;
  sector: string;
  addressNote: string;
  subtotalRwf: number;
  deliveryFeeRwf: number;
  totalRwf: number;
  commissionRwf: number;
  butcherPayoutRwf: number;
  deliveryPaidBy: "customer" | "cleva";
  clevaDeliveryCostRwf: number | null;
  momoTxnId: string | null;
  payerPhone: string | null;
  placedAt: string;
  updatedAt: string;
  paidConfirmedAt: string | null;
  butcherId: string | null;
  butcherName: string | null;
  zoneName: string | null;
  lines: Array<{ name: string; qty: number }>;
};

export function fetchDeskOrders(token: string | null, view: DeskOrderView) {
  return sendJson<{ orders: DeskShopOrder[]; counts: { toConfirm: number; open: number } }>(
    `${BASE}/orders?view=${view}`,
    token
  );
}

export function deskOrderAction(
  token: string | null,
  id: string,
  action: "confirm-payment" | "reject-payment" | "cancel",
  body: { reason?: string } = {}
) {
  return sendJson<{ status: ShopOrderStatus; butcherId?: string | null; refundPending?: boolean }>(
    `${BASE}/orders/${encodeURIComponent(id)}/${action}`,
    token,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export type OrderStep = "accept" | "ready" | "out" | "delivered" | "collected";

export function deskOrderStep(token: string | null, id: string, action: OrderStep) {
  return sendJson<{ status: ShopOrderStatus }>(`${BASE}/orders/${encodeURIComponent(id)}/step`, token, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function deskReassignOrder(token: string | null, id: string, butcherId: string) {
  return sendJson<{ status: ShopOrderStatus; butcherName: string }>(`${BASE}/orders/${encodeURIComponent(id)}/assign`, token, {
    method: "POST",
    body: JSON.stringify({ butcherId }),
  });
}

// ---------- butcher (role butcher) ----------

const BUTCHER = `${API_BASE_URL}/api/shop/butcher`;

export type ButcherOrder = {
  id: string;
  ref: string;
  status: ShopOrderStatus;
  placedAt: string;
  paidConfirmedAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  outAt: string | null;
  deliveredAt: string | null;
  district: string;
  sector: string;
  customerName: string | null;
  customerPhone: string | null;
  addressNote: string | null;
  lines: Array<{ name: string; qty: number; weightMinKg: number | null; weightMaxKg: number | null; feeRwf?: number | null }>;
  channel?: "fresh" | "kitchen";
  fulfilment?: "delivery" | "pickup";
  deliveryFeeRwf: number;
  deliveryPaidBy: "customer" | "cleva";
  butcherPayoutRwf: number;
  acceptLate: boolean;
};

export class ButcherNotLinkedError extends Error {}

export async function fetchButcherOrders(token: string | null) {
  const res = await fetch(`${BUTCHER}/orders`, { headers: readAuthHeaders(token) });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    shopName?: string;
    shopStatus?: string;
    kind?: "butcher" | "kitchen";
    orders?: ButcherOrder[];
  };
  if (!res.ok) {
    if (data.code === "not_linked") throw new ButcherNotLinkedError(data.error || "Not linked");
    throw new Error(data.error || "Could not load your orders.");
  }
  return { shopName: data.shopName ?? "", shopStatus: data.shopStatus ?? "", kind: data.kind ?? "butcher", orders: data.orders ?? [] };
}

/** A kitchen says no to a dish order; it moves to the next kitchen. */
export function partnerDeclineOrder(token: string | null, id: string, reason: string) {
  return sendJson<{ status: ShopOrderStatus }>(`${BUTCHER}/orders/${encodeURIComponent(id)}/decline`, token, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function butcherOrderStep(token: string | null, id: string, action: OrderStep) {
  return sendJson<{ status: ShopOrderStatus }>(`${BUTCHER}/orders/${encodeURIComponent(id)}/${action}`, token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ---------- money ----------

export type PayoutButcher = {
  butcherId: string;
  shopName: string;
  payoutPhone: string | null;
  payoutName: string;
  totalRwf: number;
  heldOrders: number;
  orders: Array<{
    orderId: string;
    ref: string;
    deliveredAt: string | null;
    payoutRwf: number;
    clevaDeliveryRwf: number;
    amountRwf: number;
  }>;
};

export type ShopRefund = {
  id: string;
  orderId: string;
  ref: string;
  customerName: string;
  phone: string | null;
  amountRwf: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  reference: string | null;
  note: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type ShopDayTotals = {
  day: string;
  placed: number;
  paid: number;
  paidRwf: number;
  commissionRwf: number;
  clevaDeliveryRwf: number;
  clevaNetRwf: number;
  delivered: number;
  cancelledAfterPay: number;
};

export type ShopNow = {
  paymentsToCheck: number;
  waitingForButcher: number;
  inProgress: number;
  problems: number;
  refundsToSend: number;
};

export function fetchShopPayouts(token: string | null) {
  return sendJson<{ butchers: PayoutButcher[] }>(`${BASE}/payouts`, token);
}

export function payShopButcher(
  token: string | null,
  butcherId: string,
  body: { reference: string; orderIds: string[]; expectedTotalRwf: number }
) {
  return sendJson<{ totalRwf: number; orders: number }>(`${BASE}/payouts/${encodeURIComponent(butcherId)}`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchShopRefunds(token: string | null) {
  return sendJson<{ refunds: ShopRefund[] }>(`${BASE}/refunds`, token);
}

export function markShopRefundSent(token: string | null, id: string, reference: string) {
  return sendJson<{ amountRwf: number }>(`${BASE}/refunds/${encodeURIComponent(id)}/sent`, token, {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}

export function fetchShopTotals(token: string | null, days = 7) {
  return sendJson<{ days: ShopDayTotals[]; now: ShopNow }>(`${BASE}/totals?days=${days}`, token);
}

export function setShopDeliveryCost(token: string | null, orderId: string, amountRwf: number) {
  return sendJson<{ amountRwf: number }>(`${BASE}/orders/${encodeURIComponent(orderId)}/delivery-cost`, token, {
    method: "POST",
    body: JSON.stringify({ amountRwf }),
  });
}

export function fetchButcherMoney(token: string | null) {
  return sendJson<{
    owed: { orders: number; owedRwf: number };
    payouts: Array<{ reference: string; paidAt: string; amountRwf: number; orders: number }>;
  }>(`${BUTCHER}/money`, token);
}
