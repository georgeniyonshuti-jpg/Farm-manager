import { API_BASE_URL } from "./config";

async function signupsFetch<T>(token: string | null | undefined, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/signups${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Signups request failed (${res.status})`);
  }
  if (res.headers.get("content-type")?.includes("text/csv")) {
    return (await res.text()) as T;
  }
  return (await res.json()) as T;
}

export type SignupsFunnel = {
  days: number;
  reach: {
    todayOpened: number;
    week: { opened: number; joinStarted: number; accounts: number };
    sources: Array<{ source: string; opened: number; joinStarted: number; accounts: number }>;
  };
  attempts: { total: number; succeeded: number; failed: number };
  bySource: Array<{
    source: string;
    attempts: number;
    succeeded: number;
    failed: number;
    campaign: string;
  }>;
  topErrors: Array<{ code: string; n: number }>;
  stages: Record<string, number>;
  newCount: number;
  links: Array<{ source: string; url: string }>;
};

export type SignupPerson = {
  userId: string;
  accountType: "farmer" | "buyer" | "scout" | string;
  phone: string | null;
  district: string | null;
  source: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  stage: string;
  ownerUserId?: string | null;
  ownerName?: string | null;
  nextCallAt?: string | null;
  lastTouchAt?: string | null;
  isBlocked?: boolean;
  createdAt: string;
  email: string;
  fullName: string;
  role: string;
  isActive?: boolean;
};

export type SignupTouch = {
  id: string;
  kind: string;
  outcome: string | null;
  scheduledFor: string | null;
  note: string | null;
  createdAt: string;
  byName: string | null;
};

export type SignupAttempt = {
  id: string;
  createdAt: string;
  accountType: string | null;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  district: string | null;
  source: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  outcome: string;
  errorCode: string | null;
  errorMessage: string | null;
  userId: string | null;
  handledAt: string | null;
};

export function fetchSignupsFunnel(token: string | null, days = 7, source = "") {
  const q = new URLSearchParams({ days: String(days) });
  if (source) q.set("source", source);
  return signupsFetch<SignupsFunnel>(token, `/funnel?${q}`);
}

export function fetchSignupsPeople(
  token: string | null,
  filters: Record<string, string | number | undefined> = {}
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && String(v).trim()) q.set(k, String(v));
  }
  return signupsFetch<{ people: SignupPerson[]; total: number }>(token, `/people?${q}`);
}

export function fetchSignupPerson(token: string | null, userId: string) {
  return signupsFetch<{
    person: SignupPerson;
    touches: SignupTouch[];
    profiles: Array<{
      id: string;
      displayName: string;
      verificationStatus: string;
      district: string | null;
      contactPhone: string | null;
    }>;
    buyer: {
      id: string;
      name: string;
      verificationStatus: string;
      phone: string | null;
      district: string | null;
      active: boolean;
    } | null;
    scoutApplication: {
      status: string;
      phone: string | null;
      district: string | null;
      createdAt: string;
    } | null;
    lots: Array<{
      id: string;
      birdCount: number;
      verificationStatus: string | null;
      district: string | null;
    }>;
  }>(token, `/people/${encodeURIComponent(userId)}`);
}

export function patchSignupPerson(
  token: string | null,
  userId: string,
  body: {
    stage?: string;
    ownerUserId?: string | null;
    nextCallAt?: string | null;
    block?: boolean;
    isBlocked?: boolean;
  }
) {
  return signupsFetch<{ ok: boolean }>(token, `/people/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function addSignupTouch(
  token: string | null,
  userId: string,
  body: {
    kind: "call" | "whatsapp" | "note";
    outcome?: string;
    scheduledFor?: string;
    note?: string;
  }
) {
  return signupsFetch<{ ok: boolean; id: string }>(
    token,
    `/people/${encodeURIComponent(userId)}/touches`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function fetchSignupAttempts(
  token: string | null,
  opts: { outcome?: string; handled?: string; days?: number; limit?: number } = {}
) {
  const q = new URLSearchParams();
  if (opts.outcome) q.set("outcome", opts.outcome);
  if (opts.handled) q.set("handled", opts.handled);
  if (opts.days) q.set("days", String(opts.days));
  if (opts.limit) q.set("limit", String(opts.limit));
  return signupsFetch<{ attempts: SignupAttempt[] }>(token, `/attempts?${q}`);
}

export function patchSignupAttempt(token: string | null, id: string, handled: boolean) {
  return signupsFetch<{ ok: boolean }>(token, `/attempts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ handled }),
  });
}

export function fetchSignupsNewCount(token: string | null) {
  return signupsFetch<{ newCount: number }>(token, "/new-count");
}

export function signupsExportUrl(token: string | null) {
  return `${API_BASE_URL}/api/signups/export.csv?token=${encodeURIComponent(token || "")}`;
}

export async function downloadSignupsCsv(token: string | null) {
  const res = await fetch(`${API_BASE_URL}/api/signups/export.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "signups.csv";
  a.click();
  URL.revokeObjectURL(url);
}
