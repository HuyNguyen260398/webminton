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
        </header>

        <div className="poster-two__grid">
          <Card title="CHIA ĐỘI &amp; THỂ THỨC">
            <Steps
              items={[
                <>
                  Chốt sổ 14 người nên cả hội chia thành <b>2 đội</b>, mỗi đội
                  7 người. BTC bốc thăm chia đều trình độ — không ai được tự
                  chọn đồng đội.
                </>,
                <>
                  Đánh <b>2 nội dung</b>: đôi nam và đôi nam nữ. Trận nào cũng
                  đúng <b>1 séc</b>.
                </>,
                <>
                  <b>Vòng loại 10 trận</b>: 8 trận đôi nam, 2 trận đôi nam nữ.
                  Xong thì vào 2 trận chung kết — <b>cả giải 12 trận</b>.
                </>,
                <>
                  Ở vòng loại, mỗi nam ra sân ít nhất <b>3 trận</b>, mỗi nữ ít
                  nhất <b>2 trận</b> — không ai được ngồi cắn hạt dưa cả buổi.
                  Chung kết tính riêng, ai được đội trưởng gọi tên thì đánh
                  thêm.
                </>,
              ]}
            />
          </Card>

          <Card title="HAI TRẬN CHUNG KẾT">
            <Bullets
              items={[
                <>
                  Sau vòng loại, hai đội gặp lại nhau ở <b>2 trận chung kết</b>
                  : một trận đôi nam, một trận đôi nam nữ.
                </>,
                <>
                  Điểm ghi được ở chung kết <b>nhân đôi</b> khi cộng vào tổng —
                  đang thua xa vẫn lật kèo được, đang dẫn cũng đừng vội gọi
                  món.
                </>,
                <>
                  Mỗi người chỉ đánh <b>một</b> trận chung kết. Không ai được
                  ôm cả hai, khoẻ mấy cũng vậy.
                </>,
                <>
                  Đội trưởng <b>chốt cặp chung kết từ đầu buổi</b>. Các đội
                  không biết trước cặp của đối thủ — chỉ BTC biết, tới giờ mới
                  gọi tên.
                </>,
              ]}
            />
            <div className="pill-row">
              <Pill tone="red">NHẤT</Pill>
              <Pill tone="green">NHÌ</Pill>
            </div>
          </Card>

          <Card title="LUẬT MỖI SÉC">
            <Bullets
              items={[
                <>
                  Vòng loại hay chung kết, séc nào cũng{" "}
                  <b>{rules.setTarget} điểm</b>, tính điểm trực tiếp — thắng
                  pha cầu nào ăn điểm pha đó.
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

          <Card title="TÍNH ĐIỂM &amp; DANH HIỆU">
            <p>
              Điểm của đội là <b>tổng số điểm ghi được qua cả 12 trận</b>,
              riêng 2 trận chung kết nhân đôi. Đội nào tổng cao hơn thì vô địch
              — nên kể cả biết sẽ thua trận thì vẫn phải giành từng điểm một.
            </p>
            <p>Bằng điểm thì xét lần lượt:</p>
            <div className="pill-row">
              <Pill tone="yellow">1 · Số trận thắng</Pill>
              <Pill tone="yellow">2 · Điểm chung kết</Pill>
              <Pill tone="yellow">3 · Một quả cầu vàng</Pill>
            </div>
            <p>
              Thêm <b>hai danh hiệu cá nhân</b>, BTC cử người ngồi đếm từng
              trận. Một cái để khoe, một cái để cả hội nhắc tới Tết:
            </p>
            <div className="pill-row">
              <Pill tone="red">MÁY ĐÓNG GẠCH</Pill>
              <Pill tone="outline">VUA PHÁ LƯỚI</Pill>
            </div>
          </Card>

          <Card title="MẤY ĐIỀU NHỚ GIÙM">
            <Bullets
              items={[
                <>
                  Đội trưởng nộp danh sách cặp cho BTC{" "}
                  <b>trước giờ khai mạc</b>, cả vòng loại lẫn chung kết. Nộp
                  trễ thì BTC xếp giùm, đừng kêu.
                </>,
                <>
                  Có mặt trước giờ đánh <b>{rules.lateMinutes} phút</b>. Quá{" "}
                  {rules.lateMinutes} phút kể từ lúc gọi tên là xử thua.
                </>,
                <>Giày đế không đen kẻo sân bắt đền. Cầu BTC lo, vợt tự lo.</>,
                <>Khiếu nại giải quyết ngay tại sân, BTC nói gì nghe nấy.</>,
                <>
                  Thua thì cười. Thắng thì cũng đừng cười to quá — tuần sau còn
                  gặp nhau.
                </>,
              ]}
            />
          </Card>
        </div>
      </div>
    </section>
  );
}
