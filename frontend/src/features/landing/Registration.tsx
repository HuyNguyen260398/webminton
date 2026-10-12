import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { Card, Section } from "./primitives";
import { registrationOpen } from "./sections";

// Not on the poster JPGs: registration moved to a Microsoft Form, and the
// link has to live somewhere people actually look — right under poster 1.
function deadlineLabel(iso: string | null) {
  if (!iso)
    return "Chưa chốt hạn — ghi tên sớm cho chắc suất, cả hội đang đợi bạn!";
  const d = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
  return `Hạn chót đăng ký: ${d}`;
}

export function Registration({ t }: { t: TournamentDocument }) {
  const { info } = t;
  // No form, or closed by the organiser: no section, the same rule the live
  // sections follow.
  if (!info.registrationFormUrl || !registrationOpen(info)) return null;

  return (
    <Section id="dang-ky" title="ĐĂNG KÝ THI ĐẤU">
      <Card className="registration">
        <div className="registration__body">
          <p className="registration__lead">
            Điền form nhanh hơn một pha giao cầu. Xong là có tên trong danh
            sách, có suất trong đội, và có phần trong chầu chốt sổ.
          </p>
          <p className="registration__deadline">
            {deadlineLabel(info.registrationDeadline)}
          </p>
        </div>
        <div className="registration__action">
          <a
            className="registration__cta"
            href={info.registrationFormUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            MỞ FORM ĐĂNG KÝ <span aria-hidden="true">→</span>
          </a>
          <p className="registration__note">
            Form mở ở tab mới — điền xong nhớ bấm Gửi.
          </p>
        </div>
      </Card>
    </Section>
  );
}

// Shown only while the organiser has the athletes' own team draw open; the
// draw itself lives on /boc-tham.
export function TeamDrawCta({ t }: { t: TournamentDocument }) {
  if (t.draw.status !== "open") return null;
  const waiting = t.athletes.filter((a) => a.active && a.teamId === null);
  return (
    <Section id="chia-doi" title="BỐC THĂM CHIA ĐỘI">
      <Card className="registration">
        <div className="registration__body">
          <p className="registration__lead">
            Ống thăm đã mở. Mỗi người tự bốc đội cho mình, đúng một lần — đội
            nào ra thì về đội đó, khỏi trách BTC thiên vị.
          </p>
          <p className="registration__deadline">
            {waiting.length > 0
              ? `Còn ${waiting.length} người chưa bốc — bạn có trong đó không?`
              : "Cả hội đã bốc xong — vào xem đội hình!"}
          </p>
        </div>
        <div className="registration__action">
          <a className="registration__cta" href="/boc-tham/">
            VÀO BỐC THĂM <span aria-hidden="true">→</span>
          </a>
          <p className="registration__note">
            Chọn đúng tên mình rồi hẵng bấm.
          </p>
        </div>
      </Card>
    </Section>
  );
}
