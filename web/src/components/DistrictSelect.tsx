import { useEffect, useId, useState } from "react";
import { Field, Select } from "./ui/Field";
import {
  RWANDA_PROVINCES,
  districtsInProvince,
  isRwandaDistrict,
  provinceForDistrict,
} from "../lib/rwandaLocations";
import { storeT, type StoreLocale } from "../lib/publicStoreCopy";

export function DistrictSelect({
  value,
  onChange,
  id,
  name,
  required,
  allowEmpty = true,
  emptyLabel,
  className,
  variant = "app",
  locale,
}: {
  value: string;
  onChange: (district: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  variant?: "app" | "store" | "filter";
  locale?: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1], fallback: string) =>
    locale ? storeT(locale, k) : fallback;
  const current = value.trim();
  const inferred = provinceForDistrict(current);
  const keepLegacy = Boolean(current) && !isRwandaDistrict(current);
  const [province, setProvince] = useState(inferred ?? "");
  const uid = useId();
  const provinceId = `${id || uid}-province`;
  const districtId = id || `${uid}-district`;
  const districts = province ? districtsInProvince(province) : [];
  const districtReady = Boolean(province) || keepLegacy;
  const provinceLabel = t("province", "Province");
  const districtLabel = t("district", "District");
  const selectProvinceLabel =
    variant === "filter" ? t("allProvinces", "All provinces") : t("selectProvince", "Select province");
  const selectDistrictLabel =
    emptyLabel ||
    (districtReady ? t("selectDistrict", "Select district") : t("pickProvince", "Pick a province first"));

  useEffect(() => {
    if (inferred) setProvince(inferred);
  }, [inferred]);

  function pickProvince(next: string) {
    setProvince(next);
    if (!next || provinceForDistrict(current) !== next) onChange("");
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
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
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

  if (variant === "store" || variant === "filter") {
    const fieldClass = variant === "filter" ? "store-filter" : "store-field";
    return (
      <div className={variant === "filter" ? "contents" : "grid gap-3 sm:grid-cols-2"}>
        <label className={fieldClass}>
          <span>{provinceLabel}</span>
          {provinceSelect}
        </label>
        <label className={fieldClass}>
          <span>{districtLabel}</span>
          <select {...districtSelectProps}>{districtOptions}</select>
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  );
}
