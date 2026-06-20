/** @typedef {{ feedType: string | null; balanceKg: number }} FeedStockRow */

export const INVENTORY_TXN_TYPE_IN = {
  purchase: "procurement_receipt",
  procurement: "procurement_receipt",
  procurement_receipt: "procurement_receipt",
  consumption: "feed_consumption",
  feed_consumption: "feed_consumption",
  adjustment: "adjustment",
};

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeInventoryTxnType(raw) {
  if (raw == null || raw === "") return null;
  const key = String(raw).toLowerCase().trim();
  return INVENTORY_TXN_TYPE_IN[key] ?? String(raw);
}

/**
 * @param {FeedStockRow[]} stockRows
 * @returns {FeedStockRow[]}
 */
export function filterAvailableFeedStock(stockRows) {
  return stockRows.filter((r) => r.feedType && Number(r.balanceKg) > 0);
}

/**
 * Strict stock check: feed type must exist in stock with sufficient balance.
 * @param {string} feedType
 * @param {number} feedKg
 * @param {FeedStockRow[]} stockRows
 */
export function assertFeedStockAvailable(feedType, feedKg, stockRows) {
  const ft = String(feedType ?? "").trim();
  if (!ft) {
    return { ok: false, error: "feedType is required" };
  }
  const row = stockRows.find((r) => r.feedType === ft);
  if (!row || Number(row.balanceKg) <= 0) {
    return {
      ok: false,
      error: `No stock available for feed type "${ft}". Receive stock on the Inventory page first.`,
    };
  }
  const kg = Number(feedKg);
  if (!Number.isFinite(kg) || kg <= 0) {
    return { ok: false, error: "feedKg must be greater than zero" };
  }
  if (kg > Number(row.balanceKg)) {
    return {
      ok: false,
      error: `Insufficient stock for ${ft}: ${Number(row.balanceKg).toFixed(3)} kg available, ${kg.toFixed(3)} kg requested.`,
    };
  }
  return { ok: true, availableKg: Number(row.balanceKg) };
}
