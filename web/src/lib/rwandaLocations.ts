import locations from "../data/rwandaLocations.json" with { type: "json" };

export type RwandaProvinceName = keyof typeof locations;

export type RwandaProvince = {
  name: RwandaProvinceName;
  districts: string[];
};

const PROVINCE_ORDER: RwandaProvinceName[] = [
  "Kigali City",
  "Eastern Province",
  "Northern Province",
  "Southern Province",
  "Western Province",
];

export const RWANDA_PROVINCES: RwandaProvince[] = PROVINCE_ORDER.map((name) => ({
  name,
  districts: Object.keys(locations[name]).sort((a, b) => a.localeCompare(b)),
}));

export const RWANDA_DISTRICTS: string[] = RWANDA_PROVINCES.flatMap((p) => p.districts);

const DISTRICT_SET = new Set(RWANDA_DISTRICTS);

export function isRwandaDistrict(value: string): boolean {
  return DISTRICT_SET.has(value.trim());
}

export function districtsInProvince(province: string): string[] {
  return RWANDA_PROVINCES.find((p) => p.name === province)?.districts ?? [];
}

export function provinceForDistrict(district: string): RwandaProvinceName | null {
  const name = district.trim();
  for (const province of RWANDA_PROVINCES) {
    if (province.districts.includes(name)) return province.name;
  }
  return null;
}
