const KEY = "cleva.seller.apply.v1";

export type SellerApplyDraft = {
  contactName: string;
  phone: string;
  district: string;
  birds: number;
  avgKg: number;
};

export function saveSellerApply(draft: SellerApplyDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}

export function readSellerApply(): SellerApplyDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SellerApplyDraft>;
    return {
      contactName: String(parsed.contactName || "").trim(),
      phone: String(parsed.phone || "").trim(),
      district: String(parsed.district || "").trim(),
      birds: Number(parsed.birds) > 0 ? Number(parsed.birds) : 0,
      avgKg: Number(parsed.avgKg) > 0 ? Number(parsed.avgKg) : 0,
    };
  } catch {
    return null;
  }
}

export function clearSellerApply() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
