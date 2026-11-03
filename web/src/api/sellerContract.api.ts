import { API_BASE_URL } from "./config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";
import type { RecruitmentContact } from "./marketInsights.api";

export type ContractSettings = {
  otpRequired: boolean;
  hasLogo: boolean;
  hasSignature: boolean;
  companyLegalName: string;
  companyRegistrationNo: string;
  companyTin: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  letterheadHeader: string;
  letterheadFooter: string;
  signerName: string;
  signerTitle: string;
  commissionPercent: string;
  payoutDays: string;
  acceptanceHours: string;
  rateChangeNoticeDays: string;
  terminationNoticeDays: string;
  cancellationFeeRule: string;
  nonCircumventionMonths: string;
  circumventionPenaltyRule: string;
  disputeForum: string;
  mediationDays: string;
  dataProtectionLawReference: string;
  prevailingLanguage: string;
  payoutFeeRule: string;
};

export type ContractTemplate = {
  id: string;
  want: string;
  version: number;
  language: string;
  body: string;
  isActive: boolean;
  createdAt: string;
};

export type ContractVariable = { key: string; label: string; when: string };

export type ContractSettingsPayload = {
  settings: ContractSettings;
  templates: ContractTemplate[];
  variables: ContractVariable[];
  retentionNote: string;
  smsReady: boolean;
  warning?: string | null;
};

export type SigningSession = {
  status: string;
  name: string;
  want: string;
  language: string;
  languages: string[];
  otpRequired: boolean;
  smsReady: boolean;
  text: string;
  letterheadHeader: string;
  letterheadFooter: string;
  logoDataUrl: string | null;
  expiresAt: string | null;
  hasPdf: boolean;
  message: string | null;
};

export type ContractReview = {
  canApprove: boolean;
  files: { signature?: string; selfie?: string; pdf?: string };
  history: Array<{
    id: string;
    status: string;
    language: string;
    templateVersion: number | null;
    signedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
  }>;
  contract: null | {
    id: string;
    status: string;
    language: string;
    templateVersion: number | null;
    contractNumber: string | null;
    text: string;
    typedName: string | null;
    signedAt: string | null;
    ip: string | null;
    userAgent: string | null;
    otpVerified: boolean;
    rejectionReason: string | null;
    fingerprint: string | null;
  };
};

async function sendJson<T>(url: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? jsonAuthHeaders(token) : readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not complete that.");
  return data as T;
}

export function fetchContractSettings(token: string | null) {
  return sendJson<ContractSettingsPayload>(`${API_BASE_URL}/api/super-admin/contracts`, token);
}

export function saveContractSettings(token: string | null, body: Record<string, unknown>) {
  return sendJson<ContractSettingsPayload>(`${API_BASE_URL}/api/super-admin/contracts`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function saveContractTemplate(token: string | null, body: { want: string; language: string; body: string }) {
  return sendJson<{ template: ContractTemplate }>(`${API_BASE_URL}/api/super-admin/contracts/templates`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function previewContract(token: string | null, body: { want: string; language: string; body?: string }) {
  return sendJson<{ text: string; missing: string[]; sample: boolean }>(`${API_BASE_URL}/api/super-admin/contracts/preview`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function downloadContractPreview(token: string | null, body: { want: string; language: string; body?: string }) {
  const res = await fetch(`${API_BASE_URL}/api/super-admin/contracts/preview.pdf`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Could not download the preview.");
  }
  return res.blob();
}

export function fetchSigningSession(authToken: string | null, signingToken: string) {
  return sendJson<{ session: SigningSession }>(`${API_BASE_URL}/api/public/contracts/${signingToken}`, authToken);
}

export function setSigningLanguage(authToken: string | null, signingToken: string, language: string) {
  return sendJson<{ session: SigningSession }>(`${API_BASE_URL}/api/public/contracts/${signingToken}/language`, authToken, {
    method: "POST",
    body: JSON.stringify({ language }),
  });
}

export function submitSignature(authToken: string | null, signingToken: string, body: Record<string, unknown>) {
  return sendJson<{ status: string }>(`${API_BASE_URL}/api/public/contracts/${signingToken}/sign`, authToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function requestSigningCode(authToken: string | null, signingToken: string) {
  return sendJson<{ ok: boolean }>(`${API_BASE_URL}/api/public/contracts/${signingToken}/otp`, authToken, { method: "POST", body: "{}" });
}

export function checkSigningCode(authToken: string | null, signingToken: string, code: string) {
  return sendJson<{ ok: boolean }>(`${API_BASE_URL}/api/public/contracts/${signingToken}/otp/check`, authToken, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function downloadSignedPdf(authToken: string | null, signingToken: string) {
  const res = await fetch(signedPdfUrl(signingToken), { headers: readAuthHeaders(authToken) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Could not download the agreement.");
  }
  return res.blob();
}

export function signedPdfUrl(token: string) {
  return `${API_BASE_URL}/api/public/contracts/${token}/pdf`;
}

export function fetchContractReview(token: string | null, id: string) {
  return sendJson<ContractReview>(`${API_BASE_URL}/api/insights/market/recruitment/contacts/${id}/contract`, token);
}

export function sendRecruitmentContract(token: string | null, id: string, resend = false) {
  const action = resend ? "resend" : "send";
  return sendJson<{ url: string; expiresAt: string; emailSent: boolean; contact: RecruitmentContact }>(
    `${API_BASE_URL}/api/insights/market/recruitment/contacts/${id}/contract/${action}`,
    token,
    { method: "POST", body: "{}" }
  );
}

export function approveRecruitmentContract(token: string | null, id: string) {
  return sendJson<{ contact: RecruitmentContact; copyUrl: string; emailSent: boolean }>(
    `${API_BASE_URL}/api/insights/market/recruitment/contacts/${id}/contract/approve`,
    token,
    { method: "POST", body: "{}" }
  );
}

export function rejectRecruitmentContract(token: string | null, id: string, reason: string) {
  return sendJson<{ contact: RecruitmentContact; url: string | null; linkError: string | null }>(
    `${API_BASE_URL}/api/insights/market/recruitment/contacts/${id}/contract/reject`,
    token,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export async function fetchPrivateFile(token: string | null, path: string) {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: readAuthHeaders(token) });
  if (!res.ok) throw new Error("Could not open that file.");
  return res.blob();
}
