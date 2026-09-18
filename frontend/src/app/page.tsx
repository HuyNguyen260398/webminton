"use client";
import { useTournament } from "../lib/use-tournament";
import { PosterOne } from "../features/landing/PosterOne";
import { PosterTwo } from "../features/landing/PosterTwo";
import { PosterThree } from "../features/landing/PosterThree";
import { Registration } from "../features/landing/Registration";
import { LiveSections } from "../features/landing/LiveSections";

export default function Page() {
  const { view, error, reload } = useTournament();
  if (error)
    return (
      <main id="main" className="container section">
        <p role="alert" className="error">
          {error} <button onClick={reload}>Thử lại</button>
        </p>
      </main>
    );
  if (!view)
    return (
      <main id="main" className="container section">
        <p role="status">Đang tải thông tin giải…</p>
      </main>
    );
  return (
    <main id="main">
      <PosterOne t={view.t} />
      <Registration t={view.t} />
      <div className="marquee" aria-hidden="true">
        ĐÔI NAM <b>✦</b> ĐÔI NỮ <b>✦</b> ĐÔI NAM NỮ <b>✦</b> HẾT MÌNH TỪNG ĐIỂM
      </div>
      <PosterTwo t={view.t} />
      <PosterThree t={view.t} />
      <LiveSections view={view} />
      <footer className="container section">
        <details>
          <summary>Xem thông báo và thể lệ gốc</summary>
          <div className="poster-grid">
            {[1, 2, 3].map((i) => (
              <a href={`/posters/thong-bao-trang-${i}.jpg`} key={i}>
                <img
                  src={`/posters/thong-bao-trang-${i}.jpg`}
                  width={1333}
                  height={1888}
                  loading="lazy"
                  alt={`Thông báo gốc trang ${i}: ${["giới thiệu giải", "thể lệ", "tài trợ"][i - 1]}`}
                />
              </a>
            ))}
          </div>
        </details>
      </footer>
    </main>
  );
}
