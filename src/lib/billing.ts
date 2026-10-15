import type { Customer, Payment, Expense, Payout, MonthRange } from './types';

/** 'YYYY-MM-DD' or Date -> 'YYYY-MM' */
export function monthKey(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function monthsOfYear(year: number): string[] {
  return monthsBetween(`${year}-01`, `${year}-12`);
}

function inRange(month: string, r: MonthRange): boolean {
  return month >= r.from && (!r.to || month <= r.to);
}

/** Every active customer owes their fee each month regardless of stops. Pauses skip months. */
export function isBilledInMonth(c: Pick<Customer, 'startDate' | 'pauses'>, month: string): boolean {
  if (month < monthKey(c.startDate)) return false;
  return !(c.pauses ?? []).some((r) => inRange(month, r));
}

export function isPausedNow(c: Pick<Customer, 'pauses'>, now = new Date()): boolean {
  const m = monthKey(now);
  return (c.pauses ?? []).some((r) => inRange(m, r));
}

export interface LedgerLine {
  month: string;
  billed: number;
  paid: number;
  balance: number; // cumulative balance after this month
}

/** Month-by-month ledger for a customer from their start month to `upTo`. */
export function customerLedger(c: Customer, payments: Payment[], upTo: string): LedgerLine[] {
  const start = monthKey(c.startDate);
  if (start > upTo) return [];
  const mine = payments.filter((p) => p.customerId === c.id);
  let balance = 0;
  return monthsBetween(start, upTo).map((month) => {
    const billed = isBilledInMonth(c, month) ? c.monthlyFee : 0;
    const paid = round2(mine.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0));
    balance = round2(balance + billed - paid);
    return { month, billed, paid, balance };
  });
}

export function balanceAsOf(c: Customer, payments: Payment[], upTo: string): number {
  const l = customerLedger(c, payments, upTo);
  return l.length ? l[l.length - 1].balance : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface MonthSummary {
  month: string;
  billed: number;
  collected: number;
  outstanding: number;
  helperPay: number;
  expenses: number;
  net: number;
}

/** Profit & loss for a month: billed vs collected (cash basis by receivedDate), payouts, expenses. */
export function monthSummary(
  month: string,
  customers: Customer[],
  payments: Payment[],
  expenses: Expense[],
  payouts: Payout[],
): MonthSummary {
  const billed = round2(customers.filter((c) => isBilledInMonth(c, month)).reduce((s, c) => s + c.monthlyFee, 0));
  const collected = round2(payments.filter((p) => monthKey(p.receivedDate) === month).reduce((s, p) => s + p.amount, 0));
  const helperPay = round2(payouts.filter((p) => monthKey(p.date) === month).reduce((s, p) => s + p.amount, 0));
  const exp = round2(expenses.filter((e) => monthKey(e.date) === month).reduce((s, e) => s + e.amount, 0));
  const paidForMonth = round2(payments.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0));
  return {
    month,
    billed,
    collected,
    outstanding: round2(Math.max(0, billed - paidForMonth)),
    helperPay,
    expenses: exp,
    net: round2(collected - helperPay - exp),
  };
}

export function expensesByCategory(expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) out[e.category] = round2((out[e.category] ?? 0) + e.amount);
  return out;
}

export function payoutsByMember(payouts: Payout[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of payouts) out[p.memberUid] = round2((out[p.memberUid] ?? 0) + p.amount);
  return out;
}

/** Helpers whose year total meets/exceeds the reporting threshold (e.g. 1099-NEC). */
export function overThreshold(totals: Record<string, number>, threshold: number): string[] {
  return Object.entries(totals).filter(([, v]) => v >= threshold).map(([k]) => k);
}

export function money(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}
