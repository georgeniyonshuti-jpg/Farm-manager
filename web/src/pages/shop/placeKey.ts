/** Place names compared trimmed, lowercased and with spaces collapsed, as the server does. */
export function placeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
