import { useId, useState } from "react";
import { filesToDataUrls } from "../../farm/photoUtils";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";

type Props = {
  /** Minimum photos user must add before submit (set by batch policy) */
  minCount: number;
  maxCount?: number;
  /** When set (e.g. laborer Kinyarwanda), replaces the default English picker label */
  pickerLabel?: string;
  onChangeDataUrls: (urls: string[]) => void;
  disabled?: boolean;
};

/**
 * Mobile-friendly capture: `capture="environment"` opens camera on many devices;
 * `multiple` allows gallery pick. Parent converts FileList via photoUtils.
 */
export function PhotoCaptureInput({
  minCount,
  maxCount = 6,
  pickerLabel,
  onChangeDataUrls,
  disabled,
}: Props) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const defaultPicker = useLaborerT(
    `Tap to add photos (${minCount}+ required, up to ${maxCount})`
  );

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex min-h-[52px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-emerald-700/50 bg-emerald-50/50 px-4 py-3 text-center text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
      >
        {pickerLabel ?? defaultPicker}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        // FIX: round check-ins — images only (no PDF/other uploads)
        multiple
        capture="environment"
        disabled={disabled}
        className="sr-only"
        onChange={async (e) => {
          setError(null);
          const files = e.target.files;
          if (!files?.length) {
            onChangeDataUrls([]);
            setPreview([]);
            return;
          }
          try {
            const urls = await filesToDataUrls(files);
            if (urls.length > maxCount) throw new Error(`At most ${maxCount} photos`);
            setPreview(urls);
            onChangeDataUrls(urls);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Photo error");
            onChangeDataUrls([]);
            setPreview([]);
          }
          e.target.value = "";
        }}
      />
      {preview.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {preview.map((src, i) => (
            <li key={i} className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
              <img src={src} alt="" className="h-24 w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-sm text-red-800" role="alert">
          <TranslatedText text={error} />
        </p>
      )}
    </div>
  );
}
