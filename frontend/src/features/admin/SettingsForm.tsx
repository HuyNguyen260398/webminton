'use client';

import { useState } from 'react';
import type { TournamentDocument } from '../../../../packages/domain/src/schema';
import type { CommandInput } from '../../lib/admin-api';

type Props = {
  t: TournamentDocument;
  run: (command: CommandInput) => Promise<boolean>;
  busy: boolean;
};

const fields = [
  ['name', 'Tên giải'],
  ['clubName', 'Tên CLB'],
  ['slogan', 'Khẩu hiệu'],
  ['location', 'Địa điểm'],
  ['dateLabel', 'Thời gian dự kiến'],
  ['contactName', 'Tên liên hệ BTC'],
  ['contactPhone', 'Điện thoại BTC'],
  ['zaloUrl', 'Đường dẫn Zalo'],
] as const;

export function SettingsForm({ t, run, busy }: Props) {
  const [info, setInfo] = useState(t.info);
  const [courts, setCourts] = useState(t.courts);

  return (
    <section>
      <h2>Cấu hình giải</h2>
      <form onSubmit={(event) => { event.preventDefault(); void run({ type: 'configureTournament', payload: info }); }}>
        <div className="form-grid">
          {fields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input value={info[key] ?? ''} required={['name', 'clubName', 'slogan', 'location', 'dateLabel'].includes(key)} onChange={(event) => setInfo({ ...info, [key]: event.target.value || null })} />
            </label>
          ))}
          <label>Ngày giờ khai mạc (ISO 8601)<input placeholder="2026-10-25T08:00:00+07:00" value={info.startsAt ?? ''} onChange={(event) => setInfo({ ...info, startsAt: event.target.value || null })} /></label>
          <label>Lệ phí (VND; để trống nếu chưa chốt)<input type="number" min="0" value={info.feeVnd ?? ''} onChange={(event) => setInfo({ ...info, feeVnd: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label>Hạn đăng ký (ISO 8601)<input value={info.registrationDeadline ?? ''} onChange={(event) => setInfo({ ...info, registrationDeadline: event.target.value || null })} /></label>
          <label>Đường dẫn ảnh QR<input value={info.qrAssetPath ?? ''} onChange={(event) => setInfo({ ...info, qrAssetPath: event.target.value || null })} /></label>
        </div>
        <label><span><input type="checkbox" checked={info.qrPublished} onChange={(event) => setInfo({ ...info, qrPublished: event.target.checked })} /> Đã xác nhận người nhận, công khai mã QR</span></label>
        <button disabled={busy}>Lưu thông tin giải</button>
      </form>
      <fieldset>
        <legend>Sân thi đấu</legend>
        {courts.map((court, index) => (
          <div className="form-grid" key={court.id}>
            <label>Tên sân<input value={court.name} onChange={(event) => setCourts(courts.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
            <button type="button" className="secondary" disabled={busy} onClick={() => setCourts(courts.filter((_, itemIndex) => itemIndex !== index))}>Bỏ sân</button>
          </div>
        ))}
        <button type="button" className="secondary" disabled={courts.length >= 20} onClick={() => setCourts([...courts, { id: `court-${crypto.randomUUID()}`, name: `Sân ${courts.length + 1}` }])}>Thêm sân</button>
        <button type="button" disabled={busy} onClick={() => void run({ type: 'configureCourts', payload: { courts } })}>Lưu danh sách sân</button>
      </fieldset>
      <p className="notice">Danh sách VĐV được quản lý thủ công bằng JSON config. Thể thức mặc định: đôi nam, đôi nữ, đôi nam nữ. Xử thua: 21–0 cho đối phương.</p>
    </section>
  );
}
