import Link from "next/link";
import type { PublicTournament } from "../../lib/api";
import { formatDate, formatVnd } from "../../lib/format";
export function TournamentHero({ t }: { t: PublicTournament }) {
  return (
    <section className="hero">
      <div className="container">
        <div className="eyebrow">
          <span className="dot" /> {t.info.clubName}{" "}
          <span style={{ marginLeft: "auto" }}>MÙA GIẢI 2026</span>
        </div>
        <div className="hero-grid">
          <div>
            <h1>
              GIẢI CẦU LÔNG
              <br />
              <span className="title-strip">NỘI BỘ 2026</span>
            </h1>
            <div className="slogan">
              {t.info.slogan.toLocaleUpperCase("vi-VN")}
            </div>
            <p className="hero-description">
              Bốn đội. Ba nội dung. Một ngày hết mình.
              <br />
              Cùng đồng đội tạo nên những pha cầu đáng nhớ — và một mùa giải
              không chỉ có thắng thua.
            </p>
            <div className="actions">
              <Link className="button" href="/lich-thi-dau/">
                Xem lịch thi đấu <span aria-hidden>↗</span>
              </Link>
              <Link className="button secondary" href="/van-dong-vien/">
                Danh sách VĐV
              </Link>
            </div>
          </div>
          <div className="court-art" aria-hidden="true">
            <div className="court-lines">
              <svg viewBox="0 0 200 200" fill="none">
                <path
                  d="M53 36L78 132H122L147 36L130 27L113 30L100 24L87 30L70 27Z"
                  fill="#fffdf4"
                  stroke="#17150f"
                  strokeWidth="4"
                />
                <path
                  d="M70 27L88 132M87 30L96 132M113 30L104 132M130 27L112 132M59 62H141M68 96H132"
                  stroke="#17150f"
                  strokeWidth="3"
                />
                <path
                  d="M78 132H122V145C122 177 78 177 78 145Z"
                  fill="#ffd644"
                  stroke="#17150f"
                  strokeWidth="4"
                />
                <path d="M78 142H122" stroke="#17150f" strokeWidth="5" />
              </svg>
            </div>
            <div className="season">
              LÊN SÂN<strong>2026</strong>
            </div>
            <div className="court-sticker">THÀNH BẠI TẠI VỢT!</div>
          </div>
        </div>
        <div className="event-facts">
          <div className="fact">
            <small>01 / Khi nào?</small>
            <strong>
              {t.info.startsAt ? formatDate(t.info.startsAt) : t.info.dateLabel}
            </strong>
          </div>
          <div className="fact">
            <small>02 / Ở đâu?</small>
            <strong>{t.info.location}</strong>
          </div>
          <div className="fact">
            <small>03 / Lệ phí</small>
            <strong>
              {t.info.feeVnd === null
                ? "Đang chốt — BTC công bố sau"
                : formatVnd(t.info.feeVnd)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
