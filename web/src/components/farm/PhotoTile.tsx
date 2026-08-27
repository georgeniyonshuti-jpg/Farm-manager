import { Camera } from "lucide-react";
import { PhotoCaptureInput } from "./PhotoCaptureInput";

type Props = {
  title: string;
  help?: string;
  minCount: number;
  maxCount?: number;
  allowMultiple?: boolean;
  busy?: boolean;
  pickerLabel?: string;
  onPhotos: (urls: string[]) => void;
};

/** Premium photo capture tile for field forms. */
export function PhotoTile({
  title,
  help,
  minCount,
  maxCount = 6,
  allowMultiple = true,
  busy,
  pickerLabel,
  onPhotos,
}: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
      <div className="mb-2 flex items-start gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--status-neutral-soft)] text-[var(--text-secondary)]">
          <Camera className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          {help ? <p className="type-caption">{help}</p> : null}
        </div>
      </div>
      <PhotoCaptureInput
        minCount={minCount}
        maxCount={maxCount}
        allowMultiple={allowMultiple}
        pickerLabel={pickerLabel}
        onChangeDataUrls={onPhotos}
        disabled={busy}
      />
    </div>
  );
}
