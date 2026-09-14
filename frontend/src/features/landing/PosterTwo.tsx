import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { formatVnd } from "../../lib/format";
import { Card, NumberDisc, Pill, Slab } from "./primitives";
import type { ReactNode } from "react";

// Reference: assets/poster_designs/thong-bao-trang-2.jpg

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="steps">
      {items.map((item, i) => (
        <li key={i}>
          <NumberDisc n={i + 1} tone="black" />
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="bullets">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function PosterTwo({ t }: { t: TournamentDocument }) {
  const { rules, info } = t;

  return (
    <section className="section poster-two" id="the-le">
      <div className="container">
        <header className="poster-two__head">
          <Slab tone="red" rotate={-1.5} className="poster-two__title">
            THỂ LỆ THI ĐẤU
          </Slab>
          <p className="poster-two__meta">
            {info.name}
            <br />
            {info.clubName}
          </p>
        </header>

        <div className="poster-two__grid">
          <Card title="CHIA ĐỘI &amp; THỂ THỨC">
            <Steps
              items={[
                <>
                  Cả hội chia thành <b>4 đội</b>. BTC bốc thăm chia đều trình độ
                  — không ai được tự chọn đồng đội.
                </>,
                <>
                  <b>Vòng loại:</b> bốn đội đấu xoay tua, mỗi đội gặp cả ba đội
                  còn lại — 6 lượt đấu.
                </>,
                <>
                  Mỗi lượt gặp nhau đánh <b>3 nội dung</b>: đôi nam, đôi nữ, đôi
                  nam nữ. Mỗi nội dung đúng <b>1 trận, 1 séc</b>.
                </>,
                <>
                  Vòng loại 18 trận, mỗi đội đánh 9 trận. Cộng vòng tranh hạng
                  nữa là <b>cả giải 24 trận</b>.
                </>,
              ]}
            />
          </Card>

          <Card title="VÒNG TRANH HẠNG">
            <Bullets
              items={[
                <>
                  Đội <b>nhất</b> gặp đội <b>nhì</b> vòng loại — tranh giải Nhất
                  và Nhì.
                </>,
                <>
                  Đội <b>ba</b> gặp đội <b>tư</b> — tranh giải Ba và Khuyến
                  khích.
                </>,
                <>
                  Mỗi cặp đánh đủ <b>3 nội dung</b>. Đội nào{" "}
                  <b>thắng {rules.placementWins} trên 3</b> là đội thắng.
                </>,
                <>
                  Đội trưởng được <b>xếp lại cặp theo chiến thuật</b>. Các đội
                  không biết trước cặp của đối thủ — chỉ BTC biết, tới giờ mới
                  gọi tên.
                </>,
              ]}
            />
            <div className="pill-row">
              <Pill tone="red">NHẤT</Pill>
              <Pill tone="green">NHÌ</Pill>
              <Pill tone="outline">BA</Pill>
              <Pill tone="outline">KHUYẾN KHÍCH</Pill>
            </div>
          </Card>

          <Card title="LUẬT MỖI SÉC">
            <Bullets
              items={[
                <>
                  Mỗi séc <b>{rules.setTarget} điểm</b>, tính điểm trực tiếp —
                  thắng pha cầu nào ăn điểm pha đó.
                </>,
                <>
                  <b>Đổi sân khi một bên đạt {rules.changeEndsAt} điểm</b>, áp
                  dụng cho tất cả các trận.
                </>,
                <>
                  Hoà <b>20-20</b> thì đánh tiếp, bên nào hơn {rules.minLead}{" "}
                  điểm trước thì thắng — 22-20, 23-21, 24-22.
                </>,
                <>
                  Hoà <b>24-24</b> thì bên nào chạm <b>{rules.cap}</b> trước
                  thắng luôn. Trần điểm là {rules.cap}.
                </>,
              ]}
            />
          </Card>

          <Card title="LỆ PHÍ &amp; QUỸ GIẢI">
            <div className="poster-two__fee">
              {info.feeVnd === null ? (
                <>
                  <span className="poster-two__fee-mark">???</span>
                  <span className="poster-two__fee-label">ĐANG CHỐT</span>
                </>
              ) : (
                <>
                  <span className="poster-two__fee-mark">
                    {formatVnd(info.feeVnd)}
                  </span>
                  <span className="poster-two__fee-label">MỖI NGƯỜI</span>
                </>
              )}
            </div>
            {info.feeVnd === null ? (
              <p>
                <b>Chưa có con số.</b> BTC chốt sau khi biết số người tham gia
                và số tiền tài trợ.
              </p>
            ) : (
              <p>
                <b>Lệ phí đã chốt: {formatVnd(info.feeVnd)}.</b> Nộp cho BTC
                trước ngày khai mạc.
              </p>
            )}
            <p>
              Toàn bộ tiền của giải nằm trong <b>quỹ riêng do BTC lập</b>, thu
              chi công khai sau giải. Chuyện tài trợ xem ở cuối trang.
            </p>
          </Card>

          <Card title="XẾP HẠNG SAU VÒNG LOẠI">
            <p>
              Cộng <b>tổng số điểm mỗi đội ghi được</b> qua cả 9 trận. Đội nào
              tổng điểm cao nhất xếp trên — nên kể cả biết sẽ thua thì vẫn phải
              giành từng điểm một.
            </p>
            <p>Bằng điểm thì xét lần lượt:</p>
            <div className="pill-row">
              <Pill tone="yellow">1 · Số trận thắng</Pill>
              <Pill tone="yellow">2 · Hiệu số điểm</Pill>
              <Pill tone="yellow">3 · Đối đầu trực tiếp</Pill>
            </div>
          </Card>

          <Card title="MẤY ĐIỀU NHỚ GIÙM">
            <Bullets
              items={[
                <>
                  Đội trưởng nộp danh sách cặp cho BTC <b>trước mỗi vòng</b>.
                  Nộp trễ thì BTC xếp giùm, đừng kêu.
                </>,
                <>
                  Có mặt trước giờ đánh <b>{rules.lateMinutes} phút</b>. Quá{" "}
                  {rules.lateMinutes} phút kể từ lúc gọi tên là xử thua.
                </>,
                <>
                  Giày đế không đen kẻo sân bắt đền. Cầu BTC lo, vợt tự lo.
                </>,
                <>Khiếu nại giải quyết ngay tại sân, BTC nói gì nghe nấy.</>,
                <>
                  Thua thì cười. Thắng thì cũng đừng cười to quá — tuần sau còn
                  gặp nhau.
                </>,
              ]}
            />
          </Card>
        </div>

        <footer className="poster-two__foot">
          <span>
            Đăng ký &amp; thắc mắc: nhóm Zalo hội
            {info.contactName ? ` · ${info.contactName}` : ""}
            {info.contactPhone ? ` · ${info.contactPhone}` : ""}
          </span>
          <span>Nhà tài trợ xem bên dưới · {info.location}</span>
        </footer>
      </div>
    </section>
  );
}
