import { signMarketMedia, saveMarketMedia, type MarketMediaOwnerType, type MarketMediaPurpose } from "../api/pipeline.api";

export async function uploadMarketPhoto(opts: {
  token: string | null;
  file: File;
  ownerType: MarketMediaOwnerType;
  ownerId: string;
  purpose?: MarketMediaPurpose;
  caption?: string;
}) {
  if (!opts.file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (opts.file.size > 8 * 1024 * 1024) {
    throw new Error("Image is too large (max 8 MB).");
  }
  const signed = await signMarketMedia(opts.token, { purpose: opts.purpose || "gallery" });
  const form = new FormData();
  form.append("file", opts.file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  form.append("folder", signed.folder);
  const res = await fetch(signed.uploadUrl, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as {
    public_id?: string;
    secure_url?: string;
    width?: number;
    height?: number;
    format?: string;
    bytes?: number;
    error?: { message?: string };
  };
  if (!res.ok || !body.public_id || !body.secure_url) {
    throw new Error(body.error?.message || "Photo upload failed.");
  }
  return saveMarketMedia(opts.token, {
    ownerType: opts.ownerType,
    ownerId: opts.ownerId,
    publicId: body.public_id,
    secureUrl: body.secure_url,
    width: body.width,
    height: body.height,
    format: body.format,
    bytes: body.bytes,
    purpose: opts.purpose || "gallery",
    caption: opts.caption,
  });
}
