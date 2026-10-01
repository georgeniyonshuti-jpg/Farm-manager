import { useEffect, useMemo, useRef, useState } from "react";
import { FarmerMoneySplitView, type FarmerMoneySplit } from "./MoneySplit";
import { fetchListingRankPreview } from "../../api/pipeline.api";
import { useOptionalMarketLocale } from "../../context/MarketLocaleContext";
import { storeT } from "../../lib/publicStoreCopy";
import { DistrictSelect } from "../DistrictSelect";
import {
  type ChicksInRelative,
  placementFromRelative,
  sellingWeekFromPlacement,
  sellingWeekLabel,
} from "../../lib/sellingWeek";

export type ListBirdsPayload = {
  birdCount: number;
  district: string;
  placementDate: string;
  chicksInRelative: ChicksInRelative;
  readyFrom: string;
  readyTo: string;
  contactPhone: string | null;
  avgWeightKg: number;
  askPricePerKg: number | null;
};

const RELATIVE_OPTIONS: Array<{ value: ChicksInRelative; label: string }> = [
  { value: "today", label: "Today" },
  { value: "about_week", label: "About a week" },
  { value: "about_2_weeks", label: "About 2 weeks" },
  { value: "about_month", label: "About a month" },
  { value: "date", label: "I know the date" },
];

export function ListBirdsSheet({
  open,
  token,
  initialDistrict,
  initialPhone,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  token: string | null;
  initialDistrict?: string;
  initialPhone?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: ListBirdsPayload) => void;
}) {
  const locale = useOptionalMarketLocale()?.locale || "en";
  const t = (key: Parameters<typeof storeT>[1]) => storeT(locale, key);
  const [beat, setBeat] = useState<1 | 2 | 3>(1);
  const [birds, setBirds] = useState(100);
  const [district, setDistrict] = useState(initialDistrict || "");
  const [phone, setPhone] = useState(initialPhone || "");
  const [relative, setRelative] = useState<ChicksInRelative>("about_2_weeks");
  const [exactDate, setExactDate] = useState("");
  const [overrideFrom, setOverrideFrom] = useState("");
  const [overrideTo, setOverrideTo] = useState("");
  const [editWeek, setEditWeek] = useState(false);
  const [kg, setKg] = useState(1.8);
  const [ask, setAsk] = useState(0);
  const askTouched = useRef(false);
  const [split, setSplit] = useState<FarmerMoneySplit | null>(null);
  const [inRail, setInRail] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setBeat(1);
    setDistrict(initialDistrict || "");
    setPhone(initialPhone || "");
  }, [open, initialDistrict, initialPhone]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const placementDate = useMemo(
    () => placementFromRelative(relative, new Date(), relative === "date" ? exactDate : null),
    [relative, exactDate]
  );
  const suggested = sellingWeekFromPlacement(placementDate);
  const readyFrom = overrideFrom || suggested?.readyFrom || "";
  const readyTo = overrideTo || suggested?.readyTo || "";

  const beat1Ready =
    birds > 0 && district.trim().length > 1 && Boolean(placementDate) && Boolean(suggested);
  const beat3Ready = kg > 0;
  const submitDisabled = beat === 1 ? !beat1Ready : beat === 2 ? !readyFrom || !readyTo : !beat3Ready;

  useEffect(() => {
    if (!open || beat !== 3) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void fetchListingRankPreview(token, {
        birds,
        avgKg: kg,
        ask: ask > 0 ? ask : undefined,
      })
        .then((res) => {
          if (cancelled) return;
          setSplit(res.farmerSplit || null);
          setInRail(res.inRail ?? null);
          if (!askTouched.current && res.rails?.boardFarmGate && ask <= 0) {
            setAsk(Math.round(res.rails.boardFarmGate));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSplit(null);
            setInRail(null);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [ask, beat, birds, kg, open, token]);

  const title = beat === 1 ? t("farmerListBirds") : beat === 2 ? t("farmerSellingWeek") : t("farmerYourMoney");
  const submitLabel = beat === 3 ? t("farmerPutOnBook") : "Next";

  function goBack() {
    if (beat === 1) onClose();
    else setBeat((b) => (b === 3 ? 2 : 1));
  }

  function goNext() {
    if (beat === 1) {
      setBeat(2);
      return;
    }
    if (beat === 2) {
      if (!placementDate || !readyFrom || !readyTo) return;
      setBeat(3);
      return;
    }
    if (!placementDate || !readyFrom || !readyTo) return;
    onSubmit({
      birdCount: birds,
      district: district.trim(),
      placementDate,
      chicksInRelative: relative,
      readyFrom,
      readyTo,
      contactPhone: phone.trim() || null,
      avgWeightKg: kg,
      askPricePerKg: ask > 0 ? ask : null,
    });
  }

  if (!open) return null;

  return (
    <div className="store-sheet-root">
      <button type="button" className="store-sheet-backdrop" aria-label={t("close")} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="store-sheet">
        <div className="store-sheet-handle" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            {beat > 1 ? (
              <button type="button" className="store-text-link mb-2 text-sm font-bold" onClick={goBack}>
                ← Back
              </button>
            ) : null}
            <h2 className="font-[var(--font-display)] text-2xl font-extrabold leading-tight">{title}</h2>
          </div>
          <button type="button" className="store-sheet-x" onClick={onClose} aria-label={t("close")}>
            ✕
          </button>
        </div>

        <div className="relative mt-5 space-y-4">
          {beat === 1 ? (
            <>
              <div className="store-field">
                <span>{t("birds")}</span>
                <div className="store-stepper">
                  <button type="button" onClick={() => setBirds((n) => Math.max(1, n - 10))} aria-label="-">
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={birds}
                    onChange={(e) => setBirds(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <button type="button" onClick={() => setBirds((n) => n + 10)} aria-label="+">
                    +
                  </button>
                </div>
              </div>
              <DistrictSelect variant="store" locale={locale} value={district} onChange={setDistrict} />
              <div className="store-field">
                <span>Chicks in</span>
                <div className="flex flex-wrap gap-1.5">
                  {RELATIVE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={relative === opt.value ? "store-btn store-btn-ink" : "store-btn store-btn-ghost"}
                      style={{ minHeight: 40, padding: "0 0.85rem", fontSize: "0.82rem" }}
                      onClick={() => setRelative(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {relative === "date" ? (
                <label className="store-field">
                  <span>Chicks-in date</span>
                  <input type="date" value={exactDate} onChange={(e) => setExactDate(e.target.value)} />
                </label>
              ) : null}
              <label className="store-field">
                <span>{t("phone")}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
              </label>
            </>
          ) : beat === 2 ? (
            <>
              <button
                type="button"
                className="w-full rounded-2xl border border-[var(--store-line)] bg-[var(--store-paper)] p-4 text-left"
                onClick={() => setEditWeek((v) => !v)}
              >
                <p className="font-[var(--font-display)] text-xl font-extrabold text-[var(--store-ink)]">
                  {sellingWeekLabel(readyFrom, readyTo)}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--store-ink)]">
                  {birds} {t("birds")}
                </p>
              </button>
              <p className="text-sm leading-relaxed text-[var(--store-muted)]">{t("farmerVisitHelp")}</p>
              {editWeek ? (
                <div className="store-field-row">
                  <label className="store-field">
                    <span>Week from</span>
                    <input type="date" value={readyFrom} onChange={(e) => setOverrideFrom(e.target.value)} />
                  </label>
                  <label className="store-field">
                    <span>Week to</span>
                    <input type="date" value={readyTo} onChange={(e) => setOverrideTo(e.target.value)} />
                  </label>
                </div>
              ) : (
                <button type="button" className="store-btn store-btn-ghost" onClick={() => setEditWeek(true)}>
                  Change week
                </button>
              )}
            </>
          ) : (
            <>
              <div className="store-field-row">
                <div className="store-field">
                  <span>{t("avgKg")}</span>
                  <div className="store-stepper">
                    <button
                      type="button"
                      onClick={() => setKg((n) => Math.max(0.5, Math.round((n - 0.1) * 10) / 10))}
                      aria-label="-"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      value={kg}
                      onChange={(e) => setKg(Math.max(0.5, Number(e.target.value) || 0.5))}
                    />
                    <button type="button" onClick={() => setKg((n) => Math.round((n + 0.1) * 10) / 10)} aria-label="+">
                      +
                    </button>
                  </div>
                </div>
                <div className="store-field">
                  <span>{t("farmerAskKg")}</span>
                  <div className="store-stepper">
                    <button
                      type="button"
                      onClick={() => {
                        askTouched.current = true;
                        setAsk((n) => Math.max(0, n - 50));
                      }}
                      aria-label="-"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={ask}
                      onChange={(e) => {
                        askTouched.current = true;
                        setAsk(Math.max(0, Number(e.target.value) || 0));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        askTouched.current = true;
                        setAsk((n) => n + 50);
                      }}
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              {split ? (
                <FarmerMoneySplitView split={split} locale={locale} />
              ) : (
                <p className="text-sm text-[var(--store-muted)]">{t("offerWhenPosted")}</p>
              )}
              <p className="text-sm leading-relaxed text-[var(--store-muted)]">{t("farmerAskBoard")}</p>
              {askTouched.current && inRail === false ? (
                <p className="text-sm leading-relaxed text-[var(--store-ink)]">{t("farmerAskOutOfRail")}</p>
              ) : null}
            </>
          )}

          <button type="button" className="store-btn store-btn-ember w-full" disabled={busy || submitDisabled} onClick={goNext}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
