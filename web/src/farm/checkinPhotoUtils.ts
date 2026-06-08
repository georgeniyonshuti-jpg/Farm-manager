export type PhotoSlots = {
  flockSign: string[];
  thermometer: string[];
  feed: string[];
  water: string[];
};

export type CheckinPhotoSource = {
  photoUrl?: string | null;
  photoUrls?: unknown;
};

export function toPhotoSlots(checkin: CheckinPhotoSource): PhotoSlots {
  const toArray = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => x.length > 20) : []);
  const urls = checkin.photoUrls;
  const out: PhotoSlots = { flockSign: [], thermometer: [], feed: [], water: [] };
  if (Array.isArray(urls)) {
    out.flockSign = toArray(urls);
  } else if (urls && typeof urls === "object") {
    const rec = urls as Record<string, unknown>;
    out.flockSign = toArray(rec.flockSign ?? rec.photos);
    out.thermometer = toArray(rec.thermometer);
    out.feed = toArray(rec.feed);
    out.water = toArray(rec.water);
  }
  if (out.flockSign.length === 0 && checkin.photoUrl) out.flockSign = [String(checkin.photoUrl)];
  return out;
}

export const PHOTO_SECTION_LABELS: Array<{ key: keyof PhotoSlots; label: string }> = [
  { key: "flockSign", label: "Flock sign" },
  { key: "thermometer", label: "Thermometer" },
  { key: "feed", label: "Feed" },
  { key: "water", label: "Water" },
];
