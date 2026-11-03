/**
 * Butcher shop order references and tracking tokens.
 * The ref is short and read out on the phone. The token is the secret in the
 * customer's tracking link; only its hash is stored.
 */

import crypto from "node:crypto";
import { hashToken } from "../pipeline/sellerContractText.js";

// No 0/O, 1/I/L: easy to read out and type.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REF_LENGTH = 6;

export function newOrderRef() {
  let s = "";
  for (let i = 0; i < REF_LENGTH; i += 1) s += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
  return `CK-${s}`;
}

export function normalizeOrderRef(value) {
  const s = String(value ?? "").trim().toUpperCase();
  return new RegExp(`^CK-[${REF_ALPHABET}]{${REF_LENGTH}}$`).test(s) ? s : "";
}

export function newTrackToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export { hashToken };

/** Constant-time check of a link token against the stored hash. */
export function trackTokenMatches(rawToken, storedHash) {
  const raw = String(rawToken ?? "").trim();
  if (!raw || !storedHash) return false;
  const a = Buffer.from(hashToken(raw), "hex");
  const b = Buffer.from(String(storedHash), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
