import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { formatVnd } from "../../lib/format";
import { Card, PhotoFrame, Slab } from "./primitives";

// Reference: assets/poster_designs/thong-bao-trang-1.jpg
const PHOTOS = [
  {
    src: "/photos/doi-hinh-mua-truoc.jpg",
    caption: "Đội hình mùa trước",
    alt: "Cả hội chụp chung trên sân cầu lông sau một buổi đánh, có người cầm bánh kem",
    rotate: -2,
  },
  {
    src: "/photos/cam-vang.jpg",
    caption: "Cầm vàng thì đừng để vàng rơi",
    alt: "Một thành viên cười tươi giơ tấm huy chương vàng vừa giành được bên bàn tiệc sau giải",
    rotate: 1.5,
  },
  {
    src: "/photos/hiep-phu-ngoai-quan.jpg",
    caption: "Hiệp phụ ngoài quán",
    alt: "Cả hội ngồi kín một bàn dài ngoài quán, nâng ly sau giải",
    rotate: -1,
  },
] as const;

function matchDayLabel(iso: string | null) {
  if (!iso) return "NGÀY THI ĐẤU CHỐT SAU";
  const d = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
  return `THI ĐẤU NGÀY ${d}`;
}

export function PosterOne({ t }: { t: TournamentDocument }) {
  const { info } = t;
  const facts: Array<[string, string]> = [
    ["KHI NÀO?", info.dateLabel],
    ["Ở ĐÂU?", info.location],
    [
      "ĐÁNH NHỮNG GÌ?",
      "Đôi nam · Đôi nữ · Đôi nam nữ — 4 đội đấu vòng loại xoay tua rồi tranh hạng, tổng 24 trận",
    ],
    [
      "CẦN BAO NHIÊU NGƯỜI?",
      "Tối thiểu 16, lý tưởng 24 để chia đều 4 đội. Rủ thêm bạn cùng đánh nhé",
    ],
  ];

  return (
    <section className="section poster-one" id="thong-bao">
      <div className="container">
        <div className="badge-bar">
          <strong>{info.clubName.toLocaleUpperCase("vi-VN")}</strong>
          <span>THÔNG BÁO · MÙA 2026</span>
        </div>

        <h1 className="poster-title">
          GIẢI CẦU LÔNG
          <Slab tone="red" rotate={-0.6} className="poster-title__strip">
            NỘI BỘ 2026
          </Slab>
        </h1>

        <p className="poster-one__slogan">
          <Slab tone="black">{info.slogan.toLocaleUpperCase("vi-VN")}</Slab>
        </p>

        <p className="poster-one__intro">
          Bốn đội. Ba nội dung. Vòng loại xoay tua rồi vào tranh hạng — hai mươi
          bốn trận gói gọn trong một buổi. Và một chầu chốt sổ ngay sau đó mà
          đội nào cũng có phần.
        </p>

        <Card className="poster-one__facts">
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="poster-one__fee">
          <span className="poster-one__fee-mark" aria-hidden="true">
            {info.feeVnd === null ? "???" : formatVnd(info.feeVnd)}
          </span>
          <div>
            {info.feeVnd === null ? (
              <>
                <strong>Lệ phí tham gia — BTC còn đang bấm máy tính.</strong>
                <p>
                  Chờ chốt xem bao nhiêu người đăng ký và tài trợ được bao nhiêu
                  đã. Hứa báo sớm, và hứa không để ai phải bán vợt trả nợ.
                </p>
              </>
            ) : (
              <>
                <strong>Lệ phí tham gia đã chốt.</strong>
                <p>
                  Mỗi người {formatVnd(info.feeVnd)} — nộp cho BTC trước ngày
                  khai mạc. Thu chi công khai sau giải.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="poster-one__photos">
          {PHOTOS.map((p) => (
            <div className="poster-one__photo" key={p.src}>
              <PhotoFrame
                src={p.src}
                alt={p.alt}
                caption={p.caption}
                rotate={p.rotate}
              />
            </div>
          ))}
          <span className="bubble poster-one__bubble">Thành bại tại vợt!</span>
          <span className="badge-circle poster-one__badge">
            Thua vẫn có nhậu
          </span>
        </div>

        <div className="poster-one__cta">
          <div>
            <h2>{matchDayLabel(info.startsAt)}</h2>
            <p>Thể lệ ở ngay bên dưới · Chuyện tài trợ ở cuối trang.</p>
          </div>
          <p className="poster-one__disclaimer">
            BTC không chịu trách nhiệm với các pha smash bay ra ngoài sân, và
            cũng không nhận đổ lỗi cho vợt.
          </p>
        </div>
      </div>
    </section>
  );
}
