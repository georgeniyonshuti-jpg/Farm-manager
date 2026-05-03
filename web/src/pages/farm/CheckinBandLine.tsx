import { useLaborerT } from "../../i18n/laborerI18n";

export function CheckinBandLine({ untilDay, hours }: { untilDay: number; hours: number }) {
  const t = useLaborerT(`Before day ${untilDay}: every ${hours} h`);
  return <li>{t}</li>;
}
