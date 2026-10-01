export type ScoutDraft = {
  mode: "managed" | "offplatform";
  flockId: string;
  farmProfileId: string;
  displayName: string;
  district: string;
  locationLabel: string;
  contactPhone: string;
  story: string;
  consentRecorded: boolean;
  consentName: string;
  consentPhone: string;
  visitNotes: string;
  birdCount: string;
  saleableBirds: string;
  breedCode: string;
  avgWeightKg: string;
  expectedWeightKg: string;
  readyFrom: string;
  readyTo: string;
  askPricePerKg: string;
  farmerCanSlaughter: boolean;
  deliveryAvailable: boolean;
  lotNotes: string;
  updatedAt: number;
};

const KEY = "cleva.scout.draft.v1";
const memory = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    /* ignore */
  }
  return memory.get(key) ?? null;
}

function storageSet(key: string, value: string) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    /* ignore */
  }
  memory.set(key, value);
}

function storageRemove(key: string) {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  memory.delete(key);
}

export function emptyScoutDraft(partial: Partial<ScoutDraft> = {}): ScoutDraft {
  return {
    mode: "offplatform",
    flockId: "",
    farmProfileId: "",
    displayName: "",
    district: "",
    locationLabel: "",
    contactPhone: "",
    story: "",
    consentRecorded: false,
    consentName: "",
    consentPhone: "",
    visitNotes: "",
    birdCount: "",
    saleableBirds: "",
    breedCode: "",
    avgWeightKg: "",
    expectedWeightKg: "",
    readyFrom: "",
    readyTo: "",
    askPricePerKg: "",
    farmerCanSlaughter: false,
    deliveryAvailable: false,
    lotNotes: "",
    updatedAt: 0,
    ...partial,
  };
}

export function readScoutDraft(): ScoutDraft | null {
  try {
    const raw = storageGet(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoutDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...emptyScoutDraft(), ...parsed };
  } catch {
    return null;
  }
}

export function writeScoutDraft(draft: ScoutDraft) {
  try {
    storageSet(KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

export function clearScoutDraft() {
  try {
    storageRemove(KEY);
  } catch {
    /* ignore */
  }
}

export function scoutDraftIsUseful(draft: ScoutDraft) {
  return Boolean(
    draft.displayName.trim() ||
      draft.district.trim() ||
      draft.birdCount.trim() ||
      draft.farmProfileId ||
      draft.visitNotes.trim()
  );
}
