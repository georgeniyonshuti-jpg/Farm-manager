import { useEffect, useState } from "react";
import {
  defaultPublicMarketFilters,
  type PublicMarketFilters,
  type PublicServiceFilter,
  type PublicSort,
  type PublicWeekFilter,
} from "../../lib/publicMarketFilters";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { DistrictSelect } from "../DistrictSelect";

export function StoreBoardFilters({
  filters,
  onChange,
  districts: _districts,
  locale,
  title,
  listed,
}: {
  filters: PublicMarketFilters;
  onChange: (next: PublicMarketFilters) => void;
  districts: Array<{ district: string }>;
  locale: StoreLocale;
  title: string;
  listed?: number;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const [open, setOpen] = useState(false);
  const count = [filters.week, filters.service, filters.district].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function weekLabel() {
    if (filters.week === "this") return t("thisWeek");
    if (filters.week === "next") return t("nextWeek");
    if (filters.week === "later") return t("laterWeek");
    return "";
  }

  function serviceLabel() {
    if (filters.service === "slaughter") return t("slaughter");
    if (filters.service === "delivery") return t("delivery");
    return "";
  }

  return (
    <div className="store-filter-dock">
      <div className="store-filter-bar">
        <div className="store-filter-lead">
          <h2 className="store-filter-heading">{title}</h2>
          {listed ? (
            <p className="store-filter-count">
              {listed} {t("lotsCount")}
            </p>
          ) : null}
        </div>
        <div className="store-filter-controls">
          <button
            type="button"
            className="store-filter-trigger"
            data-on={count > 0}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            {t("filters")}
            {count ? <em>{count}</em> : null}
          </button>
          <label className="store-filter-sort">
            <span className="sr-only">{t("sortBy")}</span>
            <select
              value={filters.sort}
              onChange={(e) => onChange({ ...filters, sort: e.target.value as PublicSort })}
            >
              <option value="price">{t("sortPrice")}</option>
              <option value="ready">{t("sortReady")}</option>
              <option value="birds">{t("sortBirds")}</option>
            </select>
          </label>
        </div>
      </div>

      {count ? (
        <div className="store-filter-chips">
          {filters.week ? (
            <button
              type="button"
              className="store-pill"
              onClick={() => onChange({ ...filters, week: "" })}
            >
              {weekLabel()} ×
            </button>
          ) : null}
          {filters.service ? (
            <button
              type="button"
              className="store-pill"
              onClick={() => onChange({ ...filters, service: "" })}
            >
              {serviceLabel()} ×
            </button>
          ) : null}
          {filters.district ? (
            <button
              type="button"
              className="store-pill"
              onClick={() => onChange({ ...filters, district: "" })}
            >
              {filters.district} ×
            </button>
          ) : null}
          <button type="button" className="store-text-link" onClick={() => onChange(defaultPublicMarketFilters())}>
            {t("clear")}
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="store-sheet-root">
          <button type="button" className="store-sheet-backdrop" aria-label={t("close")} onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label={t("filters")} className="store-sheet">
            <div className="store-sheet-handle" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-[var(--font-display)] text-2xl font-extrabold leading-tight">{t("filters")}</h2>
              <button type="button" className="store-sheet-x" onClick={() => setOpen(false)} aria-label={t("close")}>
                ✕
              </button>
            </div>
            <div className="store-filters store-filters-sheet">
              <label className="store-filter">
                <span>{t("filterWeek")}</span>
                <select
                  value={filters.week}
                  onChange={(e) => onChange({ ...filters, week: e.target.value as PublicWeekFilter })}
                >
                  <option value="">{t("anyWeek")}</option>
                  <option value="this">{t("thisWeek")}</option>
                  <option value="next">{t("nextWeek")}</option>
                  <option value="later">{t("laterWeek")}</option>
                </select>
              </label>
              <label className="store-filter">
                <span>{t("filterService")}</span>
                <select
                  value={filters.service}
                  onChange={(e) => onChange({ ...filters, service: e.target.value as PublicServiceFilter })}
                >
                  <option value="">{t("anyService")}</option>
                  <option value="slaughter">{t("slaughter")}</option>
                  <option value="delivery">{t("delivery")}</option>
                </select>
              </label>
              <DistrictSelect
                variant="filter"
                locale={locale}
                value={filters.district}
                onChange={(district) => onChange({ ...filters, district })}
                emptyLabel={t("allDistricts")}
              />
            </div>
            <div className="store-filter-sheet-actions">
              <button type="button" className="store-text-link" onClick={() => onChange(defaultPublicMarketFilters())}>
                {t("clear")}
              </button>
              <button type="button" className="store-btn store-btn-ember" onClick={() => setOpen(false)}>
                {t("done")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
