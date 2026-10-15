import { useState } from 'react';
import { useAuth } from '../auth';
import { newId, remove, save, useCollection } from '../lib/data';
import { balanceAsOf, isBilledInMonth, money, monthKey, todayISO } from '../lib/billing';
import { useCustomers, useNeighborhoods } from '../hooks';
import type { Payment } from '../lib/types';

export default function Payments() {
  const { settings } = useAuth();
  const { data: customers } = useCustomers();
  const { data: payments } = useCollection<Payment>('payments');
  const { data: areas } = useNeighborhoods();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [area, setArea] = useState('');
  const cur = settings.currency;

  const rows = customers
    .filter((c) => (!area || c.neighborhoodId === area) && isBilledInMonth(c, month))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paidFor = (cid: string) => payments.filter((p) => p.customerId === cid && p.month === month);

  async function markPaid(cid: string, amount: number, method: string) {
    await save(`payments/${newId('payments')}`, { customerId: cid, month, amount, method, receivedDate: todayISO() }, false);
  }

  const totalBilled = rows.reduce((s, c) => s + c.monthlyFee, 0);
  const totalPaid = rows.reduce((s, c) => s + paidFor(c.id).reduce((a, p) => a + p.amount, 0), 0);

  return (
    <>
      <h1>Payments</h1>
      <div className="row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} />
        <select value={area} onChange={(e) => setArea(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All neighborhoods</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="muted">Billed {money(totalBilled, cur)} · Received {money(totalPaid, cur)} · Open {money(Math.max(0, totalBilled - totalPaid), cur)}</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Subscriber</th><th className="num">Fee</th><th>Received this month</th><th className="num">Balance to date</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => {
              const mine = paidFor(c.id);
              const paid = mine.reduce((s, p) => s + p.amount, 0);
              const bal = balanceAsOf(c, payments, month);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="num">{money(c.monthlyFee, cur)}</td>
                  <td>
                    {mine.map((p) => (
                      <div key={p.id}>{money(p.amount, cur)} {p.method} {p.receivedDate}{' '}
                        <button className="ghost small" onClick={() => confirm('Remove this payment?') && remove(`payments/${p.id}`)}>x</button></div>
                    ))}
                    {mine.length === 0 && <span className="badge skipped">unpaid</span>}
                  </td>
                  <td className="num">{money(bal, cur)}</td>
                  <td>
                    {paid < c.monthlyFee && (
                      <>
                        <button className="small" onClick={() => markPaid(c.id, c.monthlyFee - paid, 'cash')}>Paid cash</button>{' '}
                        <button className="ghost small" onClick={() => {
                          const a = Number(prompt('Amount received', String(c.monthlyFee - paid)));
                          const m = prompt('Method (cash, check, Venmo...)', 'check') || 'other';
                          if (a > 0) markPaid(c.id, a, m);
                        }}>Other</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">No billed subscribers for this month.</p>}
      </div>
    </>
  );
}
