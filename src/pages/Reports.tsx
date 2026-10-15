import { useState } from 'react';
import { useAuth } from '../auth';
import { useCollection } from '../lib/data';
import {
  balanceAsOf, expensesByCategory, isBilledInMonth, money, monthKey, monthSummary, monthsOfYear, overThreshold, payoutsByMember,
} from '../lib/billing';
import { downloadBlob, downloadText, toCsv } from '../lib/csv';
import { buildAnnualPdf, buildStatementPdf } from '../lib/pdf';
import { loadMonthPickups } from '../lib/pickups';
import { useCustomers, useMembers, useNeighborhoods } from '../hooks';
import type { Collection, Customer, Expense, Payment, Payout } from '../lib/types';

export default function Reports() {
  const { settings } = useAuth();
  const { data: customers } = useCustomers();
  const { data: payments } = useCollection<Payment>('payments');
  const { data: expenses } = useCollection<Expense>('expenses');
  const { data: payouts } = useCollection<Payout>('payouts');
  const { data: collections } = useCollection<Collection>('collections');
  const { data: members } = useMembers();
  const { data: areas } = useNeighborhoods();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [year, setYear] = useState(new Date().getFullYear());
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const cur = settings.currency;

  const scoped = customers.filter((c) => !area || c.neighborhoodId === area);
  const billed = scoped.filter((c) => isBilledInMonth(c, month)).sort((a, b) => a.name.localeCompare(b.name));
  const scopedExpenses = expenses.filter((e) => !area || e.neighborhoodId === area);

  async function statementPdf(c: Customer, pickupsMap?: Awaited<ReturnType<typeof loadMonthPickups>>) {
    const map = pickupsMap ?? (await loadMonthPickups(month, collections));
    return buildStatementPdf({ settings, customer: c, month, payments, pickups: map.get(c.id) ?? [] });
  }

  async function download(c: Customer) {
    setBusy(true);
    (await statementPdf(c)).save(`statement-${month}-${c.name.replace(/\W+/g, '_')}.pdf`);
    setBusy(false);
  }

  async function share(c: Customer) {
    setBusy(true);
    const doc = await statementPdf(c);
    const file = new File([doc.output('blob')], `statement-${month}.pdf`, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${settings.businessName} statement ${month}` }).catch(() => undefined);
    else doc.save(file.name);
    setBusy(false);
  }

  async function downloadAll() {
    setBusy(true);
    const map = await loadMonthPickups(month, collections);
    for (const c of billed) (await statementPdf(c, map)).save(`statement-${month}-${c.name.replace(/\W+/g, '_')}.pdf`);
    setBusy(false);
  }

  const yearMonths = monthsOfYear(year).map((m) => monthSummary(m, scoped, payments, scopedExpenses, payouts));
  const yearExpenses = scopedExpenses.filter((e) => e.date.startsWith(String(year)));
  const yearPayouts = payouts.filter((p) => p.date.startsWith(String(year)));
  const cats = expensesByCategory(yearExpenses);
  const helperTotals = payoutsByMember(yearPayouts);
  const flagged = new Set(overThreshold(helperTotals, settings.reportingThreshold));
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? uid;
  const sum = (k: 'billed' | 'collected' | 'helperPay' | 'expenses' | 'net') => yearMonths.reduce((s, m) => s + m[k], 0);

  function annualCsv() {
    const rows: (string | number)[][] = [['Month', 'Billed', 'Collected', 'Helper pay', 'Expenses', 'Net']];
    yearMonths.forEach((m) => rows.push([m.month, m.billed, m.collected, m.helperPay, m.expenses, m.net]));
    rows.push(['Total', sum('billed'), sum('collected'), sum('helperPay'), sum('expenses'), sum('net')], [], ['Expense category', 'Total']);
    Object.entries(cats).forEach(([k, v]) => rows.push([k, v]));
    rows.push([], ['Helper', 'Total paid', 'At/above reporting threshold']);
    Object.entries(helperTotals).forEach(([uid, v]) => rows.push([nameOf(uid), v, flagged.has(uid) ? 'YES' : '']));
    rows.push([], ['Payments received']);
    rows.push(['Date', 'Subscriber', 'For month', 'Amount', 'Method']);
    payments.filter((p) => p.receivedDate.startsWith(String(year))).forEach((p) => rows.push([p.receivedDate, customers.find((c) => c.id === p.customerId)?.name ?? '', p.month, p.amount, p.method]));
    downloadText(`annual-summary-${year}.csv`, toCsv(rows));
  }

  return (
    <>
      <h1>Reports</h1>
      <div className="row">
        <select value={area} onChange={(e) => setArea(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All neighborhoods</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <h2>Monthly statements</h2>
      <div className="row">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} />
        <button disabled={busy || billed.length === 0} onClick={downloadAll}>Download all PDFs</button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Subscriber</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {billed.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="num">{money(balanceAsOf(c, payments, month), cur)}</td>
                <td>
                  <button className="ghost small" disabled={busy} onClick={() => download(c)}>PDF</button>{' '}
                  <button className="ghost small" disabled={busy} onClick={() => share(c)}>Share</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Profit and loss {year}</h2>
      <div className="row">
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }} />
        <button className="ghost" onClick={annualCsv}>Download CSV</button>
        <button className="ghost" onClick={() => downloadBlob(`annual-summary-${year}.pdf`, buildAnnualPdf({ settings, year, customers: scoped, payments, expenses: scopedExpenses, payouts, members }).output('blob'))}>Download PDF</button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Month</th><th className="num">Billed</th><th className="num">Collected</th><th className="num">Helper pay</th><th className="num">Expenses</th><th className="num">Net</th></tr></thead>
          <tbody>
            {yearMonths.map((m) => (
              <tr key={m.month}><td>{m.month}</td><td className="num">{money(m.billed, cur)}</td><td className="num">{money(m.collected, cur)}</td>
                <td className="num">{money(m.helperPay, cur)}</td><td className="num">{money(m.expenses, cur)}</td><td className="num">{money(m.net, cur)}</td></tr>
            ))}
            <tr><th>Total</th><th className="num">{money(sum('billed'), cur)}</th><th className="num">{money(sum('collected'), cur)}</th>
              <th className="num">{money(sum('helperPay'), cur)}</th><th className="num">{money(sum('expenses'), cur)}</th><th className="num">{money(sum('net'), cur)}</th></tr>
          </tbody>
        </table>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>Expenses by category</h3>
          {Object.entries(cats).map(([k, v]) => <div className="row" key={k}><span className="grow">{k}</span><span>{money(v, cur)}</span></div>)}
          {Object.keys(cats).length === 0 && <p className="muted">None recorded.</p>}
        </div>
        <div className="card">
          <h3>Helper totals</h3>
          {Object.entries(helperTotals).map(([uid, v]) => (
            <div className="row" key={uid}><span className="grow">{nameOf(uid)}</span><span>{money(v, cur)}</span>
              {flagged.has(uid) && <span className="badge skipped">at/over {money(settings.reportingThreshold, cur)}</span>}</div>
          ))}
          {Object.keys(helperTotals).length === 0 && <p className="muted">No payouts recorded.</p>}
          <p className="muted">Bookkeeping aid, not tax advice. Confirm reporting thresholds with a tax professional.</p>
        </div>
      </div>
    </>
  );
}
