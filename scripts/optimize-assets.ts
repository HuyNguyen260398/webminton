import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// assets/images holds full-size iOS captures (16 MB total). These are the
// web-sized copies the landing page actually ships.
const jobs = [
  [
    "assets/images/20241006_113947225_iOS.jpg",
    "frontend/public/photos/doi-hinh-mua-truoc.jpg",
    1200,
    900,
    78,
  ],
  [
    "assets/images/20241124_101630187_iOS.jpg",
    "frontend/public/photos/cam-vang.jpg",
    1200,
    900,
    78,
  ],
  [
    "assets/images/20231217_142514521_iOS.jpg",
    "frontend/public/photos/hiep-phu-ngoai-quan.jpg",
    1200,
    900,
    78,
  ],
  // The QR must stay crisp enough to scan, so it keeps a higher quality.
  [
    "assets/images/momo-qr-code.jpeg",
    "frontend/public/qr/momo.jpg",
    800,
    1200,
    92,
  ],
] as const;

for (const [from, to, width, height, quality] of jobs) {
  await mkdir(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  const info = await sharp(from)
    .rotate()
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(to);
  console.log(
    `✓ ${to} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`,
  );
}
