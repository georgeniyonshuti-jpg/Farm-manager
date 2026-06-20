const PLACEMENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} placementDate YYYY-MM-DD
 * @returns {string} YYMMDD
 */
export function formatPlacementYymmdd(placementDate) {
  const s = String(placementDate ?? "").trim();
  if (!PLACEMENT_DATE_RE.test(s)) {
    throw new Error("placementDate must be YYYY-MM-DD");
  }
  return s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10);
}

/**
 * @param {string} placementDate YYYY-MM-DD
 * @param {number} sequence Global flock sequence (poultry_flock_code_seq)
 * @returns {string} e.g. FM-260529-042
 */
export function buildFlockCode(placementDate, sequence) {
  const yymmdd = formatPlacementYymmdd(placementDate);
  const seq = String(Math.max(1, Math.floor(Number(sequence)))).padStart(3, "0");
  return `FM-${yymmdd}-${seq}`;
}
