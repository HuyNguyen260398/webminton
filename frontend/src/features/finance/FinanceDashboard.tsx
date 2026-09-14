import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { calculateFinance } from "../../../../packages/domain/src/finance";
import { formatVnd } from "../../lib/format";
import { Card } from "../landing/primitives";

export function FinanceDashboard({ t }: { t: TournamentDocument }) {
  const totals = calculateFinance(t);
  return (
    <div className="finance-grid">
      <Card title="Đã thu / đã chi">
        <div className="leaders">
          <span>Đã nhận</span>
          <i aria-hidden="true" />
          <b>{formatVnd(totals.receivedVnd)}</b>
        </div>
        <div className="leaders">
          <span>Đã chi</span>
          <i aria-hidden="true" />
          <b>{formatVnd(totals.paidVnd)}</b>
        </div>
        <div className="leaders">
          <span>Còn lại</span>
          <i aria-hidden="true" />
          <b>{formatVnd(Math.max(0, totals.balanceVnd))}</b>
        </div>
      </Card>
      <Card title="Các khoản chi">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Khoản</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {t.finance.expenses.map((e) => (
                <tr key={e.id}>
                  <td>{e.label}</td>
                  <td>{e.quantity}</td>
                  <td>{formatVnd(e.unitPriceVnd)}</td>
                  <td>{formatVnd(e.quantity * e.unitPriceVnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
