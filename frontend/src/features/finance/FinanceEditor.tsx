'use client';
import { useState } from 'react';
import type { TournamentDocument } from '../../../../packages/domain/src/schema';
import type { CommandInput } from '../../lib/admin-api';

export function FinanceEditor({ tournament, run, busy }: { tournament: TournamentDocument; run: (command: CommandInput) => Promise<boolean>; busy: boolean }) {
  const [label, setLabel] = useState(''); const [amount, setAmount] = useState('');
  return <section><h2>Cập nhật thu chi (BTC)</h2><div className="toolbar"><input aria-label="Tên khoản chi" placeholder="Tên khoản thu/chi" value={label} onChange={(e) => setLabel(e.target.value)} /><input aria-label="Số tiền" type="number" min="0" placeholder="Số tiền VND" value={amount} onChange={(e) => setAmount(e.target.value)} /><button disabled={busy || !label || !amount} onClick={() => void run({ type: 'upsertIncome', payload: { id: `income-${crypto.randomUUID()}`, label, amountVnd: Number(amount), received: false } })}>Thêm khoản thu</button><button className="secondary" disabled={busy || !label || !amount} onClick={() => void run({ type: 'upsertExpense', payload: { id: `expense-${crypto.randomUUID()}`, label, quantity: 1, unitPriceVnd: Number(amount), paid: false, note: '' } })}>Thêm dự toán chi</button><button className="secondary" disabled={busy} onClick={() => void run({ type: 'publishFinance', payload: { published: !tournament.finance.published } })}>{tournament.finance.published ? 'Ẩn thu chi' : 'Công bố thu chi'}</button></div><p className="notice">Số dư và tổng cam kết do máy chủ tính. Không hiển thị phí cá nhân khi công khai.</p></section>;
}
