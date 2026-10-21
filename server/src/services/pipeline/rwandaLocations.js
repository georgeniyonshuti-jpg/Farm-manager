// Keep this file in step with web/src/data/rwandaLocations.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const locations = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../data/rwandaLocations.json"), "utf8")
);

const PROVINCE_ORDER = [
  "Kigali City",
  "Eastern Province",
  "Northern Province",
  "Southern Province",
  "Western Province",
];

export function districtsInProvince(province) {
  const bag = locations[province];
  return bag ? Object.keys(bag).sort((a, b) => a.localeCompare(b)) : [];
}

export function provinceForDistrict(district) {
  const name = String(district || "").trim();
  for (const province of PROVINCE_ORDER) {
    if (districtsInProvince(province).includes(name)) return province;
  }
  return null;
}

export function isRwandaDistrict(value) {
  return provinceForDistrict(value) != null;
}

export function sectorsInDistrict(district) {
  const name = String(district || "").trim();
  for (const province of PROVINCE_ORDER) {
    const sectors = locations[province]?.[name];
    if (Array.isArray(sectors)) return [...sectors].sort((a, b) => a.localeCompare(b));
  }
  return [];
}

export function isSectorInDistrict(district, sector) {
  const wanted = String(sector || "").trim();
  if (!wanted) return false;
  return sectorsInDistrict(district).includes(wanted);
}

/**
 * A sector is only valid with its district. Names repeat across districts.
 * @param {unknown} district
 * @param {unknown} sector
 * @param {{ required?: boolean, sectorRequiredWithDistrict?: boolean }} [options]
 */
export function normalizePlace(district, sector, options = {}) {
  const d = String(district ?? "").trim().slice(0, 80);
  const s = String(sector ?? "").trim().slice(0, 80);
  const required = options.required === true;
  const sectorRequired = required || options.sectorRequiredWithDistrict === true;
  if (!d) {
    if (required) return { ok: false, error: "District is required.", code: "district_required" };
    if (s) return { ok: false, error: "Pick a district before a sector.", code: "sector_invalid" };
    return { ok: true, district: null, sector: null };
  }
  if (!isRwandaDistrict(d)) {
    if (s) return { ok: false, error: "That sector is not in this district.", code: "sector_invalid" };
    if (required) return { ok: false, error: "Choose a district from the list.", code: "district_invalid" };
    return { ok: true, district: d, sector: null };
  }
  if (sectorRequired && !s) return { ok: false, error: "Sector is required.", code: "sector_required" };
  if (s && !isSectorInDistrict(d, s)) {
    return { ok: false, error: "That sector is not in this district.", code: "sector_invalid" };
  }
  return { ok: true, district: d, sector: s || null };
}

/** same sector, then same district, then same province. */
export function buyerPlaceGroup(flock, buyer) {
  const flockDistrict = String(flock?.district || "").trim();
  const buyerDistrict = String(buyer?.district || "").trim();
  if (!flockDistrict || !buyerDistrict) return null;
  const flockSector = String(flock?.sector || "").trim();
  const buyerSector = String(buyer?.sector || "").trim();
  if (flockDistrict === buyerDistrict && flockSector && buyerSector && flockSector === buyerSector) return "sector";
  if (flockDistrict === buyerDistrict) return "district";
  const flockProvince = provinceForDistrict(flockDistrict);
  const buyerProvince = provinceForDistrict(buyerDistrict);
  if (flockProvince && flockProvince === buyerProvince) return "province";
  return null;
}
