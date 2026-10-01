import { useMemo } from "react";
import { PhotoTile } from "../farm/PhotoTile";
import { Field, Input, SegmentedControl } from "../ui";
import { useLaborerT } from "../../i18n/laborerI18n";

export type HouseRoundState = {
  photosFlockSign: string[];
  photosThermometer: string[];
  photosFeed: string[];
  photosWater: string[];
  coopTemperatureC: string;
  feedLevel: "full" | "low" | "empty";
  waterLevel: "yes" | "low" | "no";
};

type Props = {
  state: HouseRoundState;
  onChange: (patch: Partial<HouseRoundState>) => void;
  minPhotos?: number;
  tempExpectedMin?: number;
  tempExpectedMax?: number;
  busy?: boolean;
};

/** Returns an English i18n key (pass through useLaborerT at display time). */
export function validateHouseRoundStepKey(
  state: HouseRoundState,
  minPhotos: number
): string | null {
  if (state.photosFlockSign.length < minPhotos) {
    return "Add at least {min} flock sign photo(s).";
  }
  if (!Number.isFinite(Number(state.coopTemperatureC))) return "Coop temperature is required.";
  if (state.photosThermometer.length < 1) return "Add at least one thermometer photo.";
  const feedAvailable = state.feedLevel !== "empty";
  const waterAvailable = state.waterLevel !== "no";
  if (feedAvailable && state.photosFeed.length < 1) {
    return "Add at least one feed photo when feed is available.";
  }
  if (waterAvailable && state.photosWater.length < 1) {
    return "Add at least one water photo when water is available.";
  }
  return null;
}

export function validateHouseRoundStep(
  state: HouseRoundState,
  minPhotos: number
): string | null {
  return validateHouseRoundStepKey(state, minPhotos);
}

export function houseRoundPayloadFromState(state: HouseRoundState) {
  const feedAvailable = state.feedLevel !== "empty";
  const waterAvailable = state.waterLevel !== "no";
  return {
    photosFlockSign: state.photosFlockSign,
    photosThermometer: state.photosThermometer,
    photosFeed: state.photosFeed,
    photosWater: state.photosWater,
    coopTemperatureC: Number(state.coopTemperatureC),
    feedAvailable,
    waterAvailable,
  };
}

export function HouseRoundStep({
  state,
  onChange,
  minPhotos = 1,
  tempExpectedMin = 26,
  tempExpectedMax = 32,
  busy = false,
}: Props) {
  const lblCoopTemp = useLaborerT("Coop temperature (°C)");
  const lblFlockSignPhoto = useLaborerT("Take photo(s) of flock number sign");
  const lblThermometerPhoto = useLaborerT("Take photo of thermometer");
  const lblFeedAvail = useLaborerT("Feed is available");
  const lblWaterAvail = useLaborerT("Water is available");
  const lblFeedPhoto = useLaborerT("Take photo of available feed");
  const lblWaterPhoto = useLaborerT("Take photo of available water");
  const tRequiredVisit = useLaborerT("Required for this visit");
  const tNormal = useLaborerT("Normal — within expected range");
  const tOutOfRange = useLaborerT("Out of expected range ({min}–{max}°C)")
    .replace("{min}", String(tempExpectedMin))
    .replace("{max}", String(tempExpectedMax));
  const tExpected = useLaborerT("Expected {min}–{max}°C")
    .replace("{min}", String(tempExpectedMin))
    .replace("{max}", String(tempExpectedMax));
  const tFull = useLaborerT("Full");
  const tLow = useLaborerT("Low");
  const tEmpty = useLaborerT("Empty");
  const tYes = useLaborerT("Yes");
  const tNo = useLaborerT("No");

  const tempVerdict = useMemo(() => {
    const n = Number(state.coopTemperatureC);
    if (!Number.isFinite(n)) return null;
    if (n >= tempExpectedMin && n <= tempExpectedMax) return "ok";
    return "out";
  }, [state.coopTemperatureC, tempExpectedMin, tempExpectedMax]);

  const feedAvailable = state.feedLevel !== "empty";
  const waterAvailable = state.waterLevel !== "no";

  return (
    <div className="space-y-4">
      <CheckinPhotoBlock
        title={lblFlockSignPhoto}
        help={tRequiredVisit}
        minCount={minPhotos}
        busy={busy}
        pickerLabel={lblFlockSignPhoto}
        onPhotos={(photosFlockSign) => onChange({ photosFlockSign })}
      />
      <Field label={lblCoopTemp} htmlFor="vet-coop-temperature" help={tExpected}>
        <Input
          id="vet-coop-temperature"
          inputMode="decimal"
          className="text-lg"
          value={state.coopTemperatureC}
          placeholder="28.4"
          onChange={(e) => onChange({ coopTemperatureC: e.target.value })}
        />
      </Field>
      {tempVerdict === "ok" ? (
        <p className="text-xs font-semibold text-[var(--status-success)]">✓ {tNormal}</p>
      ) : null}
      {tempVerdict === "out" ? (
        <p className="text-xs font-semibold text-[var(--status-danger)]">{tOutOfRange}</p>
      ) : null}
      <CheckinPhotoBlock
        title={lblThermometerPhoto}
        minCount={1}
        maxCount={1}
        allowMultiple={false}
        busy={busy}
        pickerLabel={lblThermometerPhoto}
        onPhotos={(photosThermometer) => onChange({ photosThermometer })}
      />
      <SegmentedControl
        variant="grid"
        label={lblFeedAvail}
        value={state.feedLevel}
        onChange={(v) => onChange({ feedLevel: v as HouseRoundState["feedLevel"] })}
        options={[
          { value: "full", label: tFull },
          { value: "low", label: tLow },
          { value: "empty", label: tEmpty },
        ]}
      />
      {feedAvailable ? (
        <CheckinPhotoBlock
          title={lblFeedPhoto}
          minCount={1}
          busy={busy}
          pickerLabel={lblFeedPhoto}
          onPhotos={(photosFeed) => onChange({ photosFeed })}
        />
      ) : null}
      <SegmentedControl
        variant="grid"
        label={lblWaterAvail}
        value={state.waterLevel}
        onChange={(v) => onChange({ waterLevel: v as HouseRoundState["waterLevel"] })}
        options={[
          { value: "yes", label: tYes },
          { value: "low", label: tLow },
          { value: "no", label: tNo },
        ]}
      />
      {waterAvailable ? (
        <CheckinPhotoBlock
          title={lblWaterPhoto}
          minCount={1}
          busy={busy}
          pickerLabel={lblWaterPhoto}
          onPhotos={(photosWater) => onChange({ photosWater })}
        />
      ) : null}
    </div>
  );
}

function CheckinPhotoBlock({
  title,
  help,
  minCount,
  maxCount = 6,
  allowMultiple = true,
  busy,
  pickerLabel,
  onPhotos,
}: {
  title: string;
  help?: string;
  minCount: number;
  maxCount?: number;
  allowMultiple?: boolean;
  busy: boolean;
  pickerLabel?: string;
  onPhotos: (urls: string[]) => void;
}) {
  return (
    <PhotoTile
      title={title}
      help={help}
      minCount={minCount}
      maxCount={maxCount}
      allowMultiple={allowMultiple}
      busy={busy}
      pickerLabel={pickerLabel}
      onPhotos={onPhotos}
    />
  );
}
