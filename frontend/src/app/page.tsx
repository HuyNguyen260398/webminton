"use client";
import { useTournament } from "../lib/use-tournament";
import { TournamentHero } from "../features/landing/TournamentHero";
import { RulesSection } from "../features/landing/RulesSection";
import { SponsorSection } from "../features/landing/SponsorSection";
export default function Page() {
  const { data, error, refresh } = useTournament();
  return (
    <main id="main">
      {error && (
        <div className="container">
          <p role="alert" className="error">
            {error} <button onClick={() => void refresh()}>Thử lại</button>
          </p>
        </div>
      )}
      {data ? (
        <>
          <TournamentHero t={data} />
          <div className="marquee">
            ĐÔI NAM <b>✦</b> ĐÔI NỮ <b>✦</b> ĐÔI NAM NỮ <b>✦</b> HẾT MÌNH TỪNG
            ĐIỂM
          </div>
          <RulesSection />
          <SponsorSection t={data} />
          <section className="section">
            <div className="container">
              <div className="section-heading">
                <div>
                  <span className="kicker">Từ ban tổ chức</span>
                  <h2>HẸN NHAU TRÊN SÂN!</h2>
                </div>
                <p>
                  Đăng ký và trao đổi trực tiếp với BTC trong nhóm Zalo của hội.
                  {data.info.zaloUrl && (
                    <>
                      {" "}
                      <a href={data.info.zaloUrl}>Đến nhóm Zalo ↗</a>
                    </>
                  )}
                </p>
              </div>
              <details>
                <summary>Xem thông báo và thể lệ gốc</summary>
                <div className="poster-grid" style={{ marginTop: 24 }}>
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
            </div>
          </section>
        </>
      ) : (
        !error && (
          <div className="container page" role="status">
            Đang tải thông tin giải…
          </div>
        )
      )}
    </main>
  );
}
