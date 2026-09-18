import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { rankSponsors } from "../../../../packages/domain/src/finance";
import { formatVnd } from "../../lib/format";
import { Card, NumberDisc, Slab } from "./primitives";

// Reference: assets/poster_designs/thong-bao-trang-3.jpg
const TIERS = [
  {
    key: "diamond",
    name: "KIM CƯƠNG",
    tone: "black",
    body: (
      <>
        Dành cho nhà tài trợ đóng góp <b>nhiều nhất</b> giải. Một suất duy nhất,
        ai nhanh tay thì có.
      </>
    ),
  },
  {
    key: "platinum",
    name: "BẠCH KIM",
    tone: "red",
    body: (
      <>
        Dành cho nhà tài trợ đóng góp <b>nhiều thứ nhì</b>. Suýt soát hạng trên,
        vẫn oách như thường.
      </>
    ),
  },
  {
    key: "gold",
    name: "VÀNG",
    tone: "green",
    body: (
      <>
        Dành cho <b>tất cả các nhà tài trợ còn lại</b>. Góp bao nhiêu cũng quý,
        góp là có tên.
      </>
    ),
  },
] as const;

export function PosterThree({ t }: { t: TournamentDocument }) {
  const { info, finance, sponsorships } = t;
  const ranked = rankSponsors(t);
  const named = (tier: string) =>
    ranked
      .filter((r) => r.tier === tier)
      .map((r) => sponsorships.find((s) => s.id === r.id))
      .filter((s) => s !== undefined);
  const diamond = named("diamond");

  return (
    <section className="section poster-three" id="nha-tai-tro">
      <div className="container">
        <header>
          <Slab tone="red" rotate={-1.5} className="poster-three__title">
            NHÀ TÀI TRỢ
          </Slab>
        </header>

        <p className="poster-three__intro">
          Giải này chạy bằng cầu, bằng mồ hôi, và bằng lòng hảo tâm của mấy anh
          mấy chị. Ai góp một tay thì cả hội nhớ mặt — và có tên hẳn hoi trên
          bảng vinh danh.
        </p>

        <div className="poster-three__tiers">
          {TIERS.map((tier, i) => {
            const sponsors = named(tier.key);
            return (
              <Card key={tier.key} className="poster-three__tier">
                <div data-testid={`tier-${tier.key}`}>
                  <NumberDisc n={i + 1} tone={tier.tone} />
                  <h4>{tier.name}</h4>
                  <p>{tier.body}</p>
                  <hr />
                  {sponsors.length > 0 ? (
                    <ul className="poster-three__names">
                      {sponsors.map((s) => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="poster-three__gift">
                      Phần quà riêng — bật mí sau
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="poster-three__fund">
          {info.qrPublished && info.qrAssetPath ? (
            <Card className="poster-three__qr">
              <img
                src={info.qrAssetPath}
                alt="Mã QR chuyển khoản quỹ giải qua MoMo"
                width={800}
                height={1113}
                loading="lazy"
              />
            </Card>
          ) : (
            <Card dashed className="poster-three__qr poster-three__qr--empty">
              <strong>QR</strong>
              <p>Mã QR của quỹ giải sẽ cập nhật sau</p>
            </Card>
          )}

          <Card title="QUỸ GIẢI">
            <p>
              BTC lập một quỹ riêng để quản lý toàn bộ chi phí của giải và nhận
              quyên góp. Mọi khoản thu chi đều công khai trong nhóm sau khi giải
              kết thúc — không ai ăn bớt quả cầu nào.
            </p>
            <div className="poster-three__rows">
              {finance.income.map((line) => (
                <div className="leaders" key={line.id}>
                  <span>{line.label}</span>
                  <i aria-hidden="true" />
                  <b>
                    {line.amountVnd > 0 ? formatVnd(line.amountVnd) : "Sẽ chốt"}
                  </b>
                </div>
              ))}
              {sponsorships.length === 0 ? (
                <div className="leaders">
                  <span>Nhà tài trợ — chỗ này còn trống</span>
                  <i aria-hidden="true" />
                  <b>Mời anh chị</b>
                </div>
              ) : (
                sponsorships.map((s) => (
                  <div className="leaders" key={s.id}>
                    <span>Nhà tài trợ — {s.name}</span>
                    <i aria-hidden="true" />
                    <b>{formatVnd(s.amountVnd)}</b>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="poster-three__cta">
          {diamond.length === 0 ? (
            <>
              <h2>HẠNG KIM CƯƠNG ĐANG TRỐNG — AI NHANH THÌ CÓ!</h2>
              <p>
                Góp một tay cho giải, mai mốt cả hội gọi bằng anh. Phần quà từng
                hạng vẫn đang giấu kỹ, chỉ tiết lộ đúng một điều: không phải ống
                cầu đã qua sử dụng.
              </p>
            </>
          ) : (
            <>
              <h2>
                CẢM ƠN NHÀ TÀI TRỢ KIM CƯƠNG —{" "}
                {diamond.map((s) => s.name).join(" · ")}!
              </h2>
              <p>
                Cả hội nhớ mặt. Phần quà từng hạng vẫn đang giấu kỹ, chỉ tiết lộ
                đúng một điều: không phải ống cầu đã qua sử dụng.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
