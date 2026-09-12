'use client';
import { useTournament } from '../../lib/use-tournament';
import { FinanceDashboard } from '../../features/finance/FinanceDashboard';
import { useAdmin } from '../../lib/use-admin';
import { FinanceEditor } from '../../features/finance/FinanceEditor';

export default function Page() { const {data,error,refresh} = useTournament(); const admin = useAdmin(); return <main id="main" className="container page"><div className="page-heading"><span className="kicker">Công khai, rõ ràng</span><h1>Thu chi giải đấu</h1><p>Các tổng số được tính từ dữ liệu đã ghi nhận bởi ban tổ chức.</p></div>{error ? <p role="alert" className="error">{error}<button onClick={() => void refresh()}>Thử lại</button></p> : data ? <FinanceDashboard tournament={data} /> : <p role="status">Đang tải thu chi…</p>}{admin.signedIn && admin.data && <FinanceEditor tournament={admin.data} run={admin.run} busy={admin.busy} />}</main>; }
