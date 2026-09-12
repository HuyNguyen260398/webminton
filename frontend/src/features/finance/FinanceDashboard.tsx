import type { PublicTournament } from '../../lib/api';
import { formatVnd } from '../../lib/format';

export function FinanceDashboard({ tournament }: { tournament: PublicTournament }) {
  const finance = tournament.finance;
  if (!finance.published) return <p className="notice">Chưa công bố thu chi.</p>;
  const { totals, income, expenses } = finance;
  return <><div className="stats"><div className="stat"><span>Thực thu</span><strong>{formatVnd(totals!.receivedVnd)}</strong></div><div className="stat"><span>Đã chi</span><strong>{formatVnd(totals!.paidVnd)}</strong></div><div className="stat"><span>Số dư</span><strong>{formatVnd(totals!.balanceVnd)}</strong></div></div><div className="table-scroll"><table><thead><tr><th>Khoản mục</th><th>Trạng thái</th><th>Số tiền</th></tr></thead><tbody>{income!.map((item) => <tr key={item.id}><td>{item.label}</td><td>{item.received ? 'Đã nhận' : 'Cam kết'}</td><td>{formatVnd(item.amountVnd)}</td></tr>)}{expenses!.map((item) => <tr key={item.id}><td>{item.label}</td><td>{item.paid ? 'Đã chi' : 'Dự toán'}</td><td>{formatVnd(item.quantity * item.unitPriceVnd)}</td></tr>)}</tbody></table></div></>;
}
