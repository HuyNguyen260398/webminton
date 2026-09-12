'use client';
import { useTournament } from '../../lib/use-tournament';
import { useAdmin } from '../../lib/use-admin';
import { DrawWheel } from '../../features/draw/DrawWheel';

export default function Page() {
  const publicData = useTournament();
  const admin = useAdmin();
  return <main id="main" className="container page"><div className="page-heading"><span className="kicker">Cân bằng giới tính và trình độ</span><h1>Bốc thăm chia đội</h1><p>BTC thực hiện bốc thăm trên danh sách đăng ký đã được kiểm tra.</p></div>{admin.error && <p role="alert" className="error">{admin.error}</p>}{admin.signedIn && admin.data ? <DrawWheel tournament={admin.data} run={admin.run} busy={admin.busy} /> : publicData.data ? <section className="draw-panel"><div className="wheel"><span>CN1416</span><strong>{publicData.data.draw.status === 'confirmed' ? 'ĐÃ CHIA ĐỘI' : 'CHỜ BTC'}</strong></div><div><p><strong>{publicData.data.athletes.length} VĐV</strong> đang có trong danh sách công khai.</p><p className="notice">Cần tối thiểu 8 nam và 8 nữ; mọi VĐV cần có trình độ 1–3. BTC đăng nhập để bốc thăm và xác nhận kết quả.</p></div></section> : publicData.error ? <p role="alert" className="error">{publicData.error}</p> : <p role="status">Đang tải danh sách…</p>}</main>;
}
