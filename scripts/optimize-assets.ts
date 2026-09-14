import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// assets/images holds full-size iOS captures (16 MB total). These are the
// web-sized copies the landing page actually ships.
//
// The three photos are cropped to 4:3 here rather than left to the CSS
// aspect-ratio, so what lands in the frame is decided once and visibly —
// a centre crop of a tall portrait cuts heads off. `gravity` picks which
// edge to keep.
type Job = {
  from: string;
  to: string;
  width: number;
  height: number;
  quality: number;
  fit: "cover" | "inside";
  gravity?: "north" | "centre";
};

const jobs: Job[] = [
  {
    from: "assets/images/20241006_113947225_iOS.jpg",
    to: "frontend/public/photos/doi-hinh-mua-truoc.jpg",
    width: 1200,
    height: 900,
    quality: 78,
    fit: "cover",
    gravity: "centre",
  },
  {
    // Portrait source: keep the top so the face and medal stay in frame.
    from: "assets/images/20241124_101608887_iOS.jpg",
    to: "frontend/public/photos/cam-vang.jpg",
    width: 1200,
    height: 900,
    quality: 78,
    fit: "cover",
    gravity: "north",
  },
  {
    from: "assets/images/20231217_142514521_iOS.jpg",
    to: "frontend/public/photos/hiep-phu-ngoai-quan.jpg",
    width: 1200,
    height: 900,
    quality: 78,
    fit: "cover",
    gravity: "centre",
  },
  // The QR must stay whole and crisp enough to scan: never cropped.
  {
    from: "assets/images/momo-qr-code.jpeg",
    to: "frontend/public/qr/momo.jpg",
    width: 800,
    height: 1200,
    quality: 92,
    fit: "inside",
  },
];

for (const { from, to, width, height, quality, fit, gravity } of jobs) {
  await mkdir(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  const info = await sharp(from)
    .rotate()
    .resize({
      width,
      height,
      fit,
      ...(fit === "cover" ? { position: gravity ?? "centre" } : {}),
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toFile(to);
  console.log(
    `✓ ${to} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`,
  );
}
