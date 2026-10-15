import { useState } from 'react';
import { useAuth } from '../auth';
import { newId, remove, save, useCollection } from '../lib/data';
import { money, todayISO } from '../lib/billing';
import { useMembers, useNeighborhoods } from '../hooks';
import type { Expense, Payout } from '../lib/types';

export default function Money() {
  const { settings } = useAuth();
  const { data: expenses } = useCollection<Expense>('expenses');
  const { data: payouts } = useCollection<Payout>('payouts');
  const { data: members } = useMembers();
  const { data: areas } = useNeighborhoods();
  const cur = settings.currency;
  const [e, setE] = useState({ date: todayISO(), amount: '', category: settings.expenseCategories[0] ?? 'Other', payee: '', note: '', receiptRef: '', neighborhoodId: '' });
  const [p, setP] = useState({ date: todayISO(), amount: '', memberUid: '', method: 'cash', note: '' });

  async function addExpense() {
    if (!Number(e.amount)) return;
    await save(`expenses/${newId('expenses')}`, { ...e, amount: Number(e.amount) }, false);
    setE({ ...e, amount: '', payee: '', note: '', receiptRef: '' });
  }
  async function addPayout() {
    if (!Number(p.amount) || !p.memberUid) return;
    await save(`payouts/${newId('payouts')}`, { ...p, amount: Number(p.amount), basis: 'manual' }, false);
    setP({ ...p, amount: '', note: '' });
  }
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? uid;

  return (
    <>
      <h1>Expenses and helper pay</h1>
      <h2>Add expense</h2>
      <div className="card">
        <div className="grid2">
          <label>Date<input type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} /></label>
          <label>Amount<input type="number" step="0.01" inputMode="decimal" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></label>
          <label>Category
            <select value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>
              {settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Neighborhood (optional)
            <select value={e.neighborhoodId} onChange={(x) => setE({ ...e, neighborhoodId: x.target.value })}>
              <option value="">-</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>Paid to<input value={e.payee} onChange={(x) => setE({ ...e, payee: x.target.value })} /></label>
          <label>Receipt # / reference<input value={e.receiptRef} onChange={(x) => setE({ ...e, receiptRef: x.target.value })} /></label>
        </div>
        <label>Note<input value={e.note} onChange={(x) => setE({ ...e, note: x.target.value })} /></label>
        <button onClick={addExpense}>Add expense</button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Paid to</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map((x) => (
              <tr key={x.id}><td>{x.date}</td><td>{x.category}</td><td>{x.payee}{x.note && <div className="muted">{x.note}</div>}</td>
                <td className="num">{money(x.amount, cur)}</td>
                <td><button className="ghost small" onClick={() => confirm('Delete expense?') && remove(`expenses/${x.id}`)}>x</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Helper payouts</h2>
      <div className="card">
        <div className="grid2">
          <label>Helper
            <select value={p.memberUid} onChange={(x) => setP({ ...p, memberUid: x.target.value })}>
              <option value="">Choose…</option>
              {members.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={p.date} onChange={(x) => setP({ ...p, date: x.target.value })} /></label>
          <label>Amount<input type="number" step="0.01" inputMode="decimal" value={p.amount} onChange={(x) => setP({ ...p, amount: x.target.value })} /></label>
          <label>Method<input value={p.method} onChange={(x) => setP({ ...p, method: x.target.value })} /></label>
        </div>
        <label>Note<input value={p.note} onChange={(x) => setP({ ...p, note: x.target.value })} /></label>
        <button onClick={addPayout}>Record payout</button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>Helper</th><th>Note</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {[...payouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map((x) => (
              <tr key={x.id}><td>{x.date}</td><td>{nameOf(x.memberUid)}</td><td>{x.note}</td><td className="num">{money(x.amount, cur)}</td>
                <td><button className="ghost small" onClick={() => confirm('Delete payout?') && remove(`payouts/${x.id}`)}>x</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
