import { erpnextSessionHeader } from "./erpnextSession";

export function jsonAuthHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...erpnextSessionHeader() };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function readAuthHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { ...erpnextSessionHeader() };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
