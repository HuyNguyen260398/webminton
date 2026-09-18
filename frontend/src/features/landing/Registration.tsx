import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { Card, Section } from "./primitives";

// Not on the poster JPGs: registration moved to a Microsoft Form, and the
// link has to live somewhere people actually look — right under poster 1.
function deadlineLabel(iso: string | null) {
  if (!iso) return "Chưa chốt hạn — nhưng đừng để BTC phải đi nhắc từng người.";
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
  // No form, no section — closing registration is a one-field edit to
  // tournament.json, the same rule the live sections follow.
  if (!info.registrationFormUrl) return null;

  return (
    <Section id="dang-ky" title="ĐĂNG KÝ THI ĐẤU">
      <Card className="registration">
        <div className="registration__body">
          <p className="registration__lead">
            Điền form một phút là có tên trong danh sách. Đăng ký sớm để BTC còn
            bốc thăm chia đội cho đều — sát ngày mới ới thì đội nào cũng lẻ.
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
          <p className="registration__note">Form mở ở tab mới.</p>
        </div>
      </Card>
    </Section>
  );
}
