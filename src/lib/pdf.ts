import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Customer, Settings, Payment, Stop, Expense, Payout, Member } from './types';
import { customerLedger, expensesByCategory, money, monthSummary, monthsOfYear, payoutsByMember, overThreshold } from './billing';

export interface PickupLine {
  date: string;
  status: Stop['status'];
  note: string;
}

const statusLabel: Record<Stop['status'], string> = {
  pending: 'Not visited',
  collected: 'Glass collected',
  nothing_out: 'Nothing put out',
  skipped: 'Skipped',
};
export const outcomeLabel = (s: Stop['status']) => statusLabel[s];

export function buildStatementPdf(opts: {
  settings: Settings;
  customer: Customer;
  month: string;
  payments: Payment[];
  pickups: PickupLine[];
}): jsPDF {
  const { settings: s, customer: c, month, payments, pickups } = opts;
  const cur = s.currency;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(s.businessName, 14, 20);
  doc.setFontSize(11);
  doc.text(`Monthly statement - ${month}`, 14, 28);
  doc.text(`${c.name}`, 14, 40);
  doc.text(c.address, 14, 46);

  const ledger = customerLedger(c, payments, month);
  const line = ledger[ledger.length - 1];
  const prevBalance = ledger.length > 1 ? ledger[ledger.length - 2].balance : 0;
  autoTable(doc, {
    startY: 56,
    head: [['Item', 'Amount']],
    body: [
      ['Previous balance', money(prevBalance, cur)],
      [`Service fee for ${month}`, money(line?.billed ?? 0, cur)],
      ['Payments received', money(-(line?.paid ?? 0), cur)],
      ['Balance due', money(line?.balance ?? 0, cur)],
    ],
    theme: 'striped',
  });
  const y1 = (doc as any).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: y1,
    head: [['Pickup date', 'Result', 'Note']],
    body: pickups.length ? pickups.map((p) => [p.date, outcomeLabel(p.status), p.note]) : [['-', 'No pickups this month', '']],
  });
  const y2 = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.text(s.paymentInstructions, 14, y2, { maxWidth: 180 });
  doc.text(s.statementFooter, 14, y2 + 12, { maxWidth: 180 });
  return doc;
}

export function buildAnnualPdf(opts: {
  settings: Settings;
  year: number;
  customers: Customer[];
  payments: Payment[];
  expenses: Expense[];
  payouts: Payout[];
  members: Member[];
}): jsPDF {
  const { settings: s, year, customers, payments, expenses, payouts, members } = opts;
  const cur = s.currency;
  const yearPayouts = payouts.filter((p) => p.date.startsWith(String(year)));
  const yearExpenses = expenses.filter((e) => e.date.startsWith(String(year)));
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(`${s.businessName} - ${year} annual summary`, 14, 20);
  const months = monthsOfYear(year).map((m) => monthSummary(m, customers, payments, yearExpenses, yearPayouts));
  autoTable(doc, {
    startY: 28,
    head: [['Month', 'Billed', 'Collected', 'Helper pay', 'Expenses', 'Net']],
    body: months.map((m) => [m.month, money(m.billed, cur), money(m.collected, cur), money(m.helperPay, cur), money(m.expenses, cur), money(m.net, cur)]),
    foot: [[
      'Total',
      money(months.reduce((a, m) => a + m.billed, 0), cur),
      money(months.reduce((a, m) => a + m.collected, 0), cur),
      money(months.reduce((a, m) => a + m.helperPay, 0), cur),
      money(months.reduce((a, m) => a + m.expenses, 0), cur),
      money(months.reduce((a, m) => a + m.net, 0), cur),
    ]],
  });
  let y = (doc as any).lastAutoTable.finalY + 8;
  const cats = expensesByCategory(yearExpenses);
  autoTable(doc, { startY: y, head: [['Expense category', 'Total']], body: Object.entries(cats).map(([k, v]) => [k, money(v, cur)]) });
  y = (doc as any).lastAutoTable.finalY + 8;
  const totals = payoutsByMember(yearPayouts);
  const flagged = new Set(overThreshold(totals, s.reportingThreshold));
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName || uid;
  autoTable(doc, {
    startY: y,
    head: [['Helper', 'Total paid', `>= ${money(s.reportingThreshold, cur)} reporting threshold`]],
    body: Object.entries(totals).map(([uid, v]) => [nameOf(uid), money(v, cur), flagged.has(uid) ? 'YES' : '']),
  });
  doc.setFontSize(9);
  doc.text('Bookkeeping summary only - not tax advice. Confirm reporting thresholds with a tax professional.', 14, 285);
  return doc;
}
