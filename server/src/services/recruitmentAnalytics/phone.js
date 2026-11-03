/** Mask a Rwanda number. Reveal is a separate audited call. */

export function maskPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("250") && national.length >= 12) national = national.slice(3);
  if (national.startsWith("0") && national.length >= 10) national = national.slice(1);
  if (national.length < 9) return "Hidden";
  const head = national.slice(0, 2);
  const tail = national.slice(-2);
  return `+250 ${head}•• ••• ${tail}`;
}

export function phoneLooksPersonal(text) {
  return /(\+?250|0)7\d{8}/.test(String(text || "").replace(/\s/g, ""));
}
