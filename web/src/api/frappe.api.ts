/**
 * Frappe-native API adapter for ClevaFarm PWA (VITE_API_MODE=frappe).
 */
import {
  ERPNEXT_URL,
  IS_FRAPPE_MODE,
  frappeMethodUrl,
} from "./config";

type FrappeResponse<T> = { message: T };

async function callFrappe<T>(
  method: string,
  params: Record<string, string | number | boolean | undefined> = {},
  init: RequestInit = {}
): Promise<T> {
  const url = new URL(frappeMethodUrl(method));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as FrappeResponse<T> & {
    exc?: string;
    _server_messages?: string;
  };
  if (!res.ok) {
    throw new Error(data.exc ?? data._server_messages ?? `Frappe API error ${res.status}`);
  }
  return data.message ?? (data as unknown as T);
}

async function postFrappe<T>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(frappeMethodUrl(method), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as FrappeResponse<T> & {
    exc?: string;
  };
  if (!res.ok) throw new Error(data.exc ?? `Frappe API error ${res.status}`);
  return data.message ?? (data as unknown as T);
}

export async function frappeLogin(usr: string, pwd: string): Promise<void> {
  const res = await fetch(`${ERPNEXT_URL}/api/method/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usr, pwd }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Frappe login failed");
  }
}

export async function frappeLogout(): Promise<void> {
  await fetch(`${ERPNEXT_URL}/api/method/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}

export async function frappeGetMe() {
  const res = await fetch(`${ERPNEXT_URL}/api/method/frappe.auth.get_logged_user`, {
    credentials: "include",
  });
  const data = await res.json();
  const email = data.message as string;
  return {
    id: email,
    email,
    role: "manager" as const,
    companySlug: undefined,
    companyId: undefined,
  };
}

export async function frappeGetUserCompanies() {
  return callFrappe<{ companies: Array<{ id: string; name: string; slug: string }> }>(
    "company.get_user_companies"
  );
}

export async function frappeGetCompanyBySlug(slug: string) {
  return callFrappe<{ id: string; name: string; slug: string }>("company.get_company_by_slug", {
    slug,
  });
}

export async function frappeGetFlocks(slug?: string) {
  return callFrappe<{ flocks: unknown[] }>("flock.get_flocks", { slug });
}

export async function frappeGetFlockPerformance(slug?: string) {
  return callFrappe<{ flocks: unknown[] }>("reports.get_flock_performance", { slug });
}

export async function frappeCreateFeedEntry(flockId: string, payload: Record<string, unknown>) {
  return postFrappe("feed.create_feed_entry", { flock_id: flockId, ...payload });
}

export async function frappeCreateMortalityEvent(flockId: string, payload: Record<string, unknown>) {
  return postFrappe("mortality.create_mortality_event", { flock_id: flockId, ...payload });
}

export async function frappeUploadPhoto(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(frappeMethodUrl("files.upload_photo"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.exc ?? "Upload failed");
  return data.message;
}

export { IS_FRAPPE_MODE, callFrappe, postFrappe };
