import type { PublicTournament } from "../../lib/api";
import { formatVnd } from "../../lib/format";
export function SponsorSection({ t }: { t: PublicTournament }) {
  return (
    <section className="section sponsor-section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="kicker">Góp một tay, vui cả hội</span>
            <h2>NHỮNG NGƯỜI TIẾP LỬA</h2>
          </div>
          <p>
            Mỗi đóng góp đều giúp giải đấu trọn vẹn hơn. Thu chi sẽ được BTC
            công khai sau giải.
          </p>
        </div>
        <div className="cards">
          {(["diamond", "gold", "friendly"] as const).map((tier, i) => (
            <article className="card" key={tier}>
              <span className="tier">
                {["01 / Kim cương", "02 / Vàng", "03 / Thân thiện"][i]}
              </span>
              <h3>
                {
                  [
                    "Đồng hành hết mình",
                    "Tiếp sức đường cầu",
                    "Góp vui cùng hội",
                  ][i]
                }
              </h3>
              {t.sponsorships.filter((s) => s.tier === tier).length ? (
                t.sponsorships
                  .filter((s) => s.tier === tier)
                  .map((s) => (
                    <p key={s.id}>
                      <strong>{s.name}</strong>
                      <br />
                      {formatVnd(s.amountVnd)}
                    </p>
                  ))
              ) : (
                <p className="empty">Chờ những người đồng hành đầu tiên.</p>
              )}
            </article>
          ))}
        </div>
        {t.info.qrPublished && t.info.qrAssetPath && (
          <p>
            <img
              src={t.info.qrAssetPath}
              width={180}
              height={180}
              alt="Mã QR quỹ giải đã được BTC xác nhận"
            />
          </p>
        )}
      </div>
    </section>
  );
}
