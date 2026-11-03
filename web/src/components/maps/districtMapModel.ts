import sectorCenters from "../../data/sectorCenters.json" with { type: "json" };
import { isRwandaDistrict } from "../../lib/rwandaLocations.ts";

/**
 * geoBoundaries `shapeName` already matches the 30 names in rwandaLocations.
 * Add a key here only when a boundary file uses a different spelling.
 */
const DISTRICT_NAME_ALIASES: Record<string, string> = {};

const LIGHT_FILL = 0.15;
const FILL_SPAN = 0.85;

export type MapRow = {
  district: string;
  value: number;
  label: string;
  /** Set when the count belongs to one sector. Blank keeps the district center. */
  sector?: string | null;
};

export type SectorCenter = {
  district: string;
  sector: string;
  lng: number;
  lat: number;
};

export type MapPlace = {
  lng: number;
  lat: number;
  kind: "sector" | "district";
  caption: string;
};

const SECTOR_INDEX = new Map<string, SectorCenter>(
  (sectorCenters as SectorCenter[]).map((row) => [`${row.district}|${row.sector}`, row]),
);

const CIRCLE_MIN = 4;
const CIRCLE_MAX = 18;

export type BalanceRow = {
  district: string;
  supply: number;
  demand: number;
};

export type ScoutCountRow = {
  district: string;
  scouts: number;
};

export function matchDistrictName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  const aliased = DISTRICT_NAME_ALIASES[trimmed] || trimmed;
  return isRwandaDistrict(aliased) ? aliased : null;
}

export function districtFromFeature(properties: unknown): string | null {
  if (!properties || typeof properties !== "object") return null;
  const raw = (properties as { shapeName?: unknown }).shapeName;
  return matchDistrictName(raw);
}

export function splitMapRows(rows: MapRow[] | null | undefined): { onMap: MapRow[]; offMap: MapRow[] } {
  const onMap: MapRow[] = [];
  const offMap: MapRow[] = [];
  for (const row of rows || []) {
    if (!row) continue;
    const district = matchDistrictName(row.district);
    if (district) onMap.push({ ...row, district });
    else offMap.push(row);
  }
  return { onMap, offMap };
}

export function offMapSentence(rows: MapRow[] | null | undefined): string | null {
  const { offMap } = splitMapRows(rows);
  if (!offMap.length) return null;
  const parts = offMap.map((row) => `${row.district} (${row.label})`);
  return `Off the map: ${parts.join("; ")}.`;
}

export function whiteSpaceDistricts(
  balance: BalanceRow[] | null | undefined,
  scouts: ScoutCountRow[] | null | undefined,
): BalanceRow[] {
  const totals = new Map<string, { supply: number; demand: number }>();
  for (const row of balance || []) {
    if (!row) continue;
    const district = String(row.district || "").trim() || "District unknown";
    const current = totals.get(district) || { supply: 0, demand: 0 };
    current.supply += Number(row.supply) || 0;
    current.demand += Number(row.demand) || 0;
    totals.set(district, current);
  }
  const scoutCount = new Map<string, number>();
  for (const row of scouts || []) {
    if (!row) continue;
    const district = String(row.district || "").trim() || "District unknown";
    scoutCount.set(district, (scoutCount.get(district) || 0) + (Number(row.scouts) || 0));
  }
  const gaps: BalanceRow[] = [];
  for (const [district, row] of totals) {
    if (row.supply <= 0 && row.demand <= 0) continue;
    if ((scoutCount.get(district) || 0) > 0) continue;
    gaps.push({ district, supply: row.supply, demand: row.demand });
  }
  gaps.sort((a, b) => a.district.localeCompare(b.district));
  return gaps;
}

/** Light at zero, solid at the max. A max of zero stays light instead of dividing by zero. */
export function fillOpacity(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value) || value <= 0) return LIGHT_FILL;
  const share = Math.min(1, value / max);
  return LIGHT_FILL + share * FILL_SPAN;
}

export function sectorCenter(district: string, sector: string): SectorCenter | null {
  const known = matchDistrictName(district);
  if (!known || typeof sector !== "string" || !sector.trim()) return null;
  return SECTOR_INDEX.get(`${known}|${sector.trim()}`) || null;
}

/**
 * A known sector uses its center. A blank or unknown sector falls back to the
 * district center. The caption says which one was used.
 */
export function placeFor(
  district: string,
  sector: string | null | undefined,
  districtCenter: { lng: number; lat: number } | null,
): MapPlace | null {
  const known = matchDistrictName(district);
  if (!known) return null;
  const wanted = typeof sector === "string" ? sector.trim() : "";
  if (wanted) {
    const hit = sectorCenter(known, wanted);
    if (hit) return { lng: hit.lng, lat: hit.lat, kind: "sector", caption: "Circle is the sector center." };
    if (!districtCenter) return null;
    return {
      lng: districtCenter.lng,
      lat: districtCenter.lat,
      kind: "district",
      caption: "Sector is not on the map. Circle is the district center.",
    };
  }
  if (!districtCenter) return null;
  const caption = sector === ""
    ? "Sector not recorded. Circle is the district center."
    : "Circle is the district center.";
  return { lng: districtCenter.lng, lat: districtCenter.lat, kind: "district", caption };
}

/** Zero draws no circle. Larger counts grow toward a cap so one district cannot cover the country. */
export function circleRadius(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const top = Math.max(Number.isFinite(max) ? max : 0, value);
  if (!(top > 0)) return 0;
  const share = Math.sqrt(value / top);
  return CIRCLE_MIN + share * (CIRCLE_MAX - CIRCLE_MIN);
}
