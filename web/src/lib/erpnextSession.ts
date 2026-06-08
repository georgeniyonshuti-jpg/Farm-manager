const ERPNEXT_SID_KEY = "erpnext_sid";

export function getErpnextSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ERPNEXT_SID_KEY);
}

export function setErpnextSessionId(sid: string | null) {
  if (typeof window === "undefined") return;
  if (sid) sessionStorage.setItem(ERPNEXT_SID_KEY, sid);
  else sessionStorage.removeItem(ERPNEXT_SID_KEY);
}

export function erpnextSessionHeader(): Record<string, string> {
  const sid = getErpnextSessionId();
  if (!sid) return {};
  return { "X-ERPNext-Session": sid };
}
