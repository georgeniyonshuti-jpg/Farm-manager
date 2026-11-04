import { API_BASE_URL } from "./config";
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
  zones: Array<{ zoneId: string; priority: number }>;
};

export type ShopSetup = {
  settings: ShopSettings | null;
  products: ShopProduct[];
  zones: ShopZone[];
  butchers: ShopButcher[];
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

export function saveShopZone(token: string | null, id: string | null, body: Omit<ShopZone, "id">) {
  return save<{ zone: ShopZone }>(token, "/zones", id, body);
}

export function saveShopButcher(token: string | null, id: string | null, body: Omit<ShopButcher, "id" | "userId">) {
  return save<{ butcher: ShopButcher }>(token, "/butchers", id, body);
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

export function fetchShopCatalog() {
  return publicJson<ShopCatalog>(`${PUBLIC}/catalog`);
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
