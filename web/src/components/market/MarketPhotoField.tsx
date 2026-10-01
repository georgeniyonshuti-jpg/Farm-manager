import { useId, useState } from "react";
import { uploadMarketPhoto } from "../../lib/cloudinaryUpload";
import type { MarketMedia, MarketMediaOwnerType, MarketMediaPurpose } from "../../api/pipeline.api";
import { deleteMarketMedia, patchMarketMedia } from "../../api/pipeline.api";
import { Button } from "../ui";

export function MarketPhotoField({
  token,
  ownerType,
  ownerId,
  media,
  onChange,
}: {
  token: string | null;
  ownerType: MarketMediaOwnerType;
  ownerId: string;
  media: MarketMedia[];
  onChange: (next: MarketMedia[]) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !ownerId) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...media];
      for (const file of Array.from(files).slice(0, 8)) {
        const purpose: MarketMediaPurpose = next.some((m) => m.purpose === "cover") ? "gallery" : "cover";
        const saved = await uploadMarketPhoto({ token, file, ownerType, ownerId, purpose });
        next.push(saved.media);
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: MarketMedia) {
    setBusy(true);
    try {
      await deleteMarketMedia(token, item.id);
      onChange(media.filter((m) => m.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function makeCover(item: MarketMedia) {
    setBusy(true);
    try {
      await patchMarketMedia(token, item.id, { purpose: "cover" });
      onChange(media.map((m) => ({ ...m, purpose: m.id === item.id ? "cover" : m.purpose === "cover" ? "gallery" : m.purpose })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border-color)] px-3 type-body font-semibold text-[var(--text-primary)]"
      >
        {busy ? "Uploading…" : "Add photos"}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        disabled={busy || !ownerId}
        className="sr-only"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error ? <p className="type-caption text-[var(--status-danger)]">{error}</p> : null}
      {media.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {media.map((m) => (
            <li key={m.id} className="space-y-1">
              <img src={m.secureUrl} alt="" className="h-24 w-full rounded-control object-cover" />
              <div className="flex gap-1">
                {m.purpose !== "cover" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void makeCover(m)}>
                    Cover
                  </Button>
                ) : (
                  <span className="type-caption text-[var(--text-muted)]">Cover</span>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => void remove(m)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
