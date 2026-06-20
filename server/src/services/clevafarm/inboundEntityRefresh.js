/** @type {Map<string, () => Promise<void>>} */
const refreshByEntity = new Map();

/**
 * @param {string} entityType
 * @param {() => Promise<void>} fn
 */
export function registerInboundEntityRefresh(entityType, fn) {
  refreshByEntity.set(entityType, fn);
}

/**
 * @param {string} entityType
 */
export async function refreshAfterInboundEntity(entityType) {
  const fn = refreshByEntity.get(entityType);
  if (fn) await fn();
}
