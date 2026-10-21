/** Rwanda numbers accepted at signup. Spaces and dashes are ignored. */

export function normalizeRwandaPhone(raw: string): string {
  return String(raw ?? "").trim().replace(/[\s-]/g, "");
}

export function rwandaPhoneError(raw: string, opts: { required?: boolean } = {}): string | null {
  const value = normalizeRwandaPhone(raw);
  if (!value) return opts.required ? "Phone is required." : null;
  if (/^7\d{8}$/.test(value)) return null;
  if (/^0\d{9}$/.test(value)) return null;
  if (/^\+250\d{9}$/.test(value)) return null;
  if (/^250\d{9}$/.test(value)) return null;
  return "Enter a Rwanda phone number: 9 digits starting with 7, 10 digits starting with 0, or 12 digits starting with 250 (you can add +).";
}
