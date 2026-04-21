import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, "..", "public");
/** Use clean icon source for app/pwa assets. */
const svg = path.join(pub, "icon-512.svg");

await sharp(svg).resize(192, 192).png().toFile(path.join(pub, "pwa-192.png"));
await sharp(svg).resize(512, 512).png().toFile(path.join(pub, "pwa-512.png"));
await sharp(svg).resize(180, 180).png().toFile(path.join(pub, "apple-touch-icon.png"));
await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: "#0F8F78",
  },
})
  .composite([{ input: await sharp(svg).resize(410, 410).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(path.join(pub, "pwa-maskable-512.png"));

console.log("Wrote pwa-192.png, pwa-512.png, pwa-maskable-512.png, apple-touch-icon.png");
