import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, "..", "public");
/** Same source as favicon (`index.html` → `/logo.svg`) so PWA / apple-touch icons match the app logo. */
const svg = path.join(pub, "logo.svg");

await sharp(svg).resize(192, 192).png().toFile(path.join(pub, "pwa-192.png"));
await sharp(svg).resize(512, 512).png().toFile(path.join(pub, "pwa-512.png"));
await sharp(svg).resize(180, 180).png().toFile(path.join(pub, "apple-touch-icon.png"));

console.log("Wrote pwa-192.png, pwa-512.png, apple-touch-icon.png");
