'use client';
import { useState } from 'react';
import type { TournamentDocument } from '../../../../packages/domain/src/schema';
import type { CommandInput } from '../../lib/admin-api';
import { TeamPreview } from './TeamPreview';

export function DrawWheel({ tournament, run, busy }: { tournament: TournamentDocument; run: (command: CommandInput) => Promise<boolean>; busy: boolean }) {
  const [animate, setAnimate] = useState(true);
  const active = tournament.athletes.filter((athlete) => athlete.active);
  const men = active.filter((athlete) => athlete.gender === 'male').length;
  const women = active.length - men;
  const ready = men >= 8 && women >= 8 && active.every((athlete) => athlete.skillBand !== null);
  const draft = tournament.draw.status === 'draft';
  return <section className="draw-panel"><div className={animate ? 'wheel spinning' : 'wheel'} aria-live="polite"><span>CN1416</span><strong>{draft ? 'ĐÃ CHIA ĐỘI' : 'SẴN SÀNG'}</strong></div><div><p><strong>{active.length} VĐV</strong> · {men} nam · {women} nữ</p>{!ready && <p className="error">Cần tối thiểu 8 nam và 8 nữ; mọi VĐV phải có trình độ 1–3 trước khi bốc thăm.</p>}<div className="actions"><button disabled={busy || !ready || draft || tournament.draw.status === 'confirmed'} onClick={() => void run({type:'generateDraw',payload:{}})}>Quay bốc thăm</button><button type="button" className="secondary" onClick={() => setAnimate(false)}>Bỏ hoạt ảnh</button>{draft && <button disabled={busy} onClick={() => void run({type:'confirmDraw',payload:{rosterHash:tournament.draw.rosterHash!}})}>Xác nhận chia đội</button>}{draft && <button disabled={busy} className="secondary" onClick={() => void run({type:'resetDraw',payload:{reason:'Điều chỉnh kết quả bốc thăm'}})}>Làm lại</button>}</div><p className="notice">Thuật toán cân bằng giới tính, số người và trình độ. Bản nháp được lưu trên máy chủ; chỉ BTC mới có thể xác nhận.</p></div>{draft && <TeamPreview tournament={tournament}/>}</section>;
}
