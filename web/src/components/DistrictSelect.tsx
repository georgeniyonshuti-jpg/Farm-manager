import { useEffect, useId, useState } from "react";
import { Field, Select } from "./ui/Field";
import {
  RWANDA_PROVINCES,
  districtsInProvince,
  isRwandaDistrict,
  isSectorInDistrict,
  provinceForDistrict,
  sectorsInDistrict,
} from "../lib/rwandaLocations";
import { storeT, type StoreLocale } from "../lib/publicStoreCopy";

export function DistrictSelect({
  value,
  onChange,
  sector = "",
  onSectorChange,
  onProvinceChange,
  id,
  name,
  required,
  allowEmpty = true,
  emptyLabel,
  provinceEmptyLabel,
  sectorEmptyLabel,
  className,
  variant = "app",
  locale,
  layout = "split",
  includeSector = true,
}: {
  value: string;
  onChange: (district: string) => void;
  sector?: string;
  onSectorChange?: (sector: string) => void;
  onProvinceChange?: (province: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  provinceEmptyLabel?: string;
  sectorEmptyLabel?: string;
  className?: string;
  variant?: "app" | "store" | "filter";
  locale?: StoreLocale;
  /** `stack` stays one column even on a wide screen, so a narrow phone column does not clip the labels. */
  layout?: "split" | "stack";
  /** Demand preferences store a district only. */
  includeSector?: boolean;
}) {
  const t = (k: Parameters<typeof storeT>[1], fallback: string) =>
    locale ? storeT(locale, k) : fallback;
  const current = value.trim();
  const inferred = provinceForDistrict(current);
  const keepLegacy = Boolean(current) && !isRwandaDistrict(current);
  const [province, setProvince] = useState(inferred ?? "");
  const [localSector, setLocalSector] = useState(sector);
  const uid = useId();
  const provinceId = `${id || uid}-province`;
  const districtId = id || `${uid}-district`;
  const sectorId = `${id || uid}-sector`;
  const districts = province ? districtsInProvince(province) : [];
  const districtReady = Boolean(province) || keepLegacy;
  const sectorValue = onSectorChange ? sector : localSector;
  const sectors = isRwandaDistrict(current) ? sectorsInDistrict(current) : [];
  const sectorReady = sectors.length > 0;
  const provinceLabel = t("province", "Province");
  const districtLabel = t("district", "District");
  const sectorLabel = t("sector", "Sector");
  const selectProvinceLabel =
    provinceEmptyLabel ||
    (variant === "filter" ? t("allProvinces", "All provinces") : t("selectProvince", "Select province"));
  const selectDistrictLabel =
    emptyLabel ||
    (districtReady ? t("selectDistrict", "Select district") : t("pickProvince", "Pick a province first"));
  const selectSectorLabel = sectorReady
    ? sectorEmptyLabel ||
      (variant === "filter" ? t("allSectors", "All sectors") : t("selectSector", "Select sector"))
    : t("pickDistrict", "Pick a district first");

  useEffect(() => {
    if (!inferred) return;
    setProvince(inferred);
    onProvinceChange?.(inferred);
  }, [inferred, onProvinceChange]);

  function setSector(next: string) {
    if (onSectorChange) onSectorChange(next);
    else setLocalSector(next);
  }

  function pickProvince(next: string) {
    setProvince(next);
    onProvinceChange?.(next);
    if (!next || provinceForDistrict(current) !== next) {
      onChange("");
      setSector("");
    }
  }

  function pickDistrict(next: string) {
    onChange(next);
    if (!isSectorInDistrict(next, sectorValue)) setSector("");
  }

  const provinceSelect = (
    <select
      id={provinceId}
      required={required}
      value={province}
      onChange={(e) => pickProvince(e.target.value)}
      className={className}
    >
      <option value="">{selectProvinceLabel}</option>
      {RWANDA_PROVINCES.map((item) => (
        <option key={item.name} value={item.name}>
          {item.name}
        </option>
      ))}
    </select>
  );

  const districtSelectProps = {
    id: districtId,
    name,
    required: required ? districtReady : undefined,
    disabled: !districtReady,
    autoComplete: "address-level2" as const,
    value: current,
    onChange: (e: { target: { value: string } }) => pickDistrict(e.target.value),
    className,
  };

  const districtOptions = (
    <>
      {allowEmpty ? <option value="">{selectDistrictLabel}</option> : null}
      {keepLegacy ? <option value={current}>{current}</option> : null}
      {districts.map((district) => (
        <option key={district} value={district}>
          {district}
        </option>
      ))}
    </>
  );

  const sectorSelectProps = {
    id: sectorId,
    required: required && sectorReady ? true : undefined,
    disabled: !sectorReady,
    value: sectorReady && sectors.includes(sectorValue) ? sectorValue : "",
    onChange: (e: { target: { value: string } }) => setSector(e.target.value),
    className,
  };

  const sectorOptions = (
    <>
      <option value="">{selectSectorLabel}</option>
      {sectors.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </>
  );

  const columns = includeSector ? "sm:grid-cols-3" : "sm:grid-cols-2";

  if (variant === "store" || variant === "filter") {
    const fieldClass = variant === "filter" ? "store-filter" : "store-field";
    return (
      <div className={variant === "filter" ? "contents" : `grid gap-3 ${layout === "stack" ? "" : columns}`}>
        <label className={fieldClass}>
          <span>{provinceLabel}</span>
          {provinceSelect}
        </label>
        <label className={fieldClass}>
          <span>{districtLabel}</span>
          <select {...districtSelectProps}>{districtOptions}</select>
        </label>
        {includeSector ? (
          <label className={fieldClass}>
            <span>{sectorLabel}</span>
            <select {...sectorSelectProps}>{sectorOptions}</select>
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <div className={layout === "stack" ? "grid gap-3" : `grid gap-3 ${columns}`}>
      <Field label={provinceLabel} htmlFor={provinceId}>
        <Select
          id={provinceId}
          required={required}
          value={province}
          onChange={(e) => pickProvince(e.target.value)}
          className={className}
        >
          <option value="">{selectProvinceLabel}</option>
          {RWANDA_PROVINCES.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={districtLabel} htmlFor={districtId}>
        <Select {...districtSelectProps}>{districtOptions}</Select>
      </Field>
      {includeSector ? (
        <Field label={sectorLabel} htmlFor={sectorId}>
          <Select {...sectorSelectProps}>{sectorOptions}</Select>
        </Field>
      ) : null}
    </div>
  );
}
