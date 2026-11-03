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
