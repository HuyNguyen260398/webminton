import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// assets/images holds full-size iOS captures (16 MB total). These are the
// web-sized copies the landing page actually ships.
//
// The three photos are cropped here rather than left to the CSS
// aspect-ratio, so what lands in the frame is decided once and visibly.
//
// The frames are 6:5, not 4:3. cam-vang.jpg is a 3:4 portrait, so it fills
// the frame's width at 100% of the source — the subject cannot be made
// smaller without letterboxing, and a taller frame is the only way to reveal
// more of the scene above and below it. Photos 1 and 3 are native 4:3 and
// give up ~10% of their width, which is invisible on a centred group shot.
type Job = {
  from: string;
  to: string;
  width: number;
  height: number;
  quality: number;
  fit: "cover" | "inside";
  gravity?: "north" | "centre";
  /** Fraction of the leftover height to skip before a "north" crop.
      0 keeps the very top, 1 the very bottom. Tuned against the poster. */
  offset?: number;
};

const jobs: Job[] = [
  {
    from: "assets/images/20241006_113947225_iOS.jpg",
    to: "frontend/public/photos/doi-hinh-mua-truoc.jpg",
    width: 1200,
    height: 1000,
    quality: 78,
    fit: "cover",
    gravity: "centre",
  },
  {
    // Portrait source: keep the top so the face and medal stay in frame.
    from: "assets/images/20241124_101608887_iOS.jpg",
    to: "frontend/public/photos/cam-vang.jpg",
    width: 1200,
    height: 1000,
    quality: 78,
    fit: "cover",
    gravity: "north",
    offset: 0.16,
  },
  {
    from: "assets/images/20231217_142514521_iOS.jpg",
    to: "frontend/public/photos/hiep-phu-ngoai-quan.jpg",
    width: 1200,
    height: 1000,
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

for (const { from, to, width, height, quality, fit, gravity, offset } of jobs) {
  await mkdir(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  let pipeline = sharp(from).rotate();

  if (offset !== undefined) {
    // Pre-extract the exact band to keep, so the crop is explicit rather
    // than whatever a gravity keyword happens to choose.
    const meta = await sharp(from).rotate().metadata();
    const bandHeight = Math.round((meta.width! * height) / width);
    const top = Math.round((meta.height! - bandHeight) * offset);
    pipeline = pipeline.extract({
      left: 0,
      top,
      width: meta.width!,
      height: bandHeight,
    });
  }

  const info = await pipeline
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
