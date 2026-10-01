import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, "..", "public");
/** Prefer exact raster master; fall back to logo.svg. */
const png = path.join(pub, "logo.png");
const svg = path.join(pub, "logo.svg");
const src = fs.existsSync(png) ? png : svg;

await sharp(src).resize(192, 192).png().toFile(path.join(pub, "pwa-192.png"));
await sharp(src).resize(512, 512).png().toFile(path.join(pub, "pwa-512.png"));
await sharp(src).resize(180, 180).png().toFile(path.join(pub, "apple-touch-icon.png"));
await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: "#FFFFFF",
  },
})
  .composite([{ input: await sharp(src).resize(410, 410).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(path.join(pub, "pwa-maskable-512.png"));

console.log("Wrote pwa-192.png, pwa-512.png, pwa-maskable-512.png, apple-touch-icon.png from", path.basename(src));
