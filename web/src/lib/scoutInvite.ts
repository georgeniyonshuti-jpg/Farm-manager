const KEY = "cleva-scout-invite";

export type ScoutInviteHandoff = {
  url: string;
  emailSent: boolean;
  emailError?: string | null;
  farmName?: string;
  birdCount?: string;
  readyFrom?: string;
  readyTo?: string;
  consentRecorded?: boolean;
};

export function scoutInviteKey(farmId: string) {
  return `${KEY}:${farmId}`;
}

export function saveScoutInvite(farmId: string, payload: ScoutInviteHandoff) {
  sessionStorage.setItem(scoutInviteKey(farmId), JSON.stringify(payload));
}

export function readScoutInvite(farmId: string): ScoutInviteHandoff | null {
  try {
    const raw = sessionStorage.getItem(scoutInviteKey(farmId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoutInviteHandoff;
    if (!parsed || (typeof parsed !== "object")) return null;
    if (!parsed.url && !parsed.emailError) return null;
    return parsed;
  } catch {
    return null;
  }
}
