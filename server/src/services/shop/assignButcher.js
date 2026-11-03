/**
 * Butcher shop zones and butcher choice. Pure: callers load the rows.
 * Place names are compared trimmed, lowercased and with spaces collapsed.
 * Stored names are not changed.
 */

export function placeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function zoneSectors(zone) {
  return Array.isArray(zone?.sectors) ? zone.sectors.map(placeKey).filter(Boolean) : [];
}

function isActive(row) {
  return (row?.active ?? true) !== false;
}

/** The active zone that serves this district and sector, or null. */
export function zoneForSector(zones, district, sector) {
  const d = placeKey(district);
  const s = placeKey(sector);
  if (!d || !s) return null;
  return (
    (zones || []).find((z) => isActive(z) && placeKey(z.district) === d && zoneSectors(z).includes(s)) ?? null
  );
}

/**
 * Sectors in `zone` that another active zone in the same district already
 * serves. Empty means the zone can be saved.
 */
export function zoneSectorConflicts(zones, zone) {
  if (!isActive(zone)) return [];
  const d = placeKey(zone.district);
  const mine = new Set(zoneSectors(zone));
  const clashes = [];
  for (const other of zones || []) {
    if (!isActive(other) || other.id === zone.id || placeKey(other.district) !== d) continue;
    for (const s of zoneSectors(other)) {
      if (mine.has(s)) clashes.push({ sector: s, zoneId: other.id, zoneName: other.name });
    }
  }
  return clashes;
}

/**
 * Pick the butcher for a paid order: active butchers linked to the zone,
 * lowest priority number first. Ties go to the lower id so the choice is
 * stable. Ops can reassign afterwards.
 *
 * @param {Array<{ butcherId: string, status: string, priority?: number }>} links
 */
export function pickButcher(links) {
  const active = (links || [])
    .filter((l) => l?.butcherId && l.status === "active")
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || String(a.butcherId).localeCompare(String(b.butcherId)));
  if (active.length === 0) return { butcherId: null, choices: 0 };
  return { butcherId: active[0].butcherId, choices: active.length };
}
