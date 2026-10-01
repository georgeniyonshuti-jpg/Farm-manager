/** Public Cleva market WhatsApp (E.164 without +). */
export const CLEVA_MARKET_WHATSAPP = "250796683323";

export function normalizeMarketWhatsapp(value?: string | null): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 10) digits = `250${digits.slice(1)}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Vite override, else the published Cleva number. */
export function envMarketWhatsapp(): string | null {
  return normalizeMarketWhatsapp(import.meta.env.VITE_MARKET_WHATSAPP);
}

export function clevaMarketWhatsapp(): string {
  return envMarketWhatsapp() || CLEVA_MARKET_WHATSAPP;
}

export function waMeHref(whatsapp: string, text?: string): string | null {
  const digits = normalizeMarketWhatsapp(whatsapp);
  if (!digits) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${q}`;
}
