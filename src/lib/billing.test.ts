import { describe, it, expect } from 'vitest';
import {
  isBilledInMonth, customerLedger, balanceAsOf, monthSummary, monthsBetween,
  expensesByCategory, payoutsByMember, overThreshold, monthKey,
} from './billing';
import type { Customer, Payment, Expense, Payout } from './types';

const cust = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', name: 'Ann', address: '1 Main', phone: '', email: '', notes: '',
  neighborhoodId: 'n1', routeId: 'r1', startDate: '2026-01-15', pauses: [],
  monthlyFee: 20, emailOptIn: true, emailFrequency: 'pickup', ...over,
});
const pay = (over: Partial<Payment>): Payment => ({
  id: Math.random().toString(), customerId: 'c1', month: '2026-01', amount: 20,
  method: 'cash', receivedDate: '2026-01-20', ...over,
});

describe('billing', () => {
  it('generates month ranges across years', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('bills from the start month, not before', () => {
    const c = cust();
    expect(isBilledInMonth(c, '2025-12')).toBe(false);
    expect(isBilledInMonth(c, '2026-01')).toBe(true);
  });

  it('skips paused months, open-ended and closed ranges', () => {
    const c = cust({ pauses: [{ from: '2026-03', to: '2026-04' }, { from: '2026-09' }] });
    expect(isBilledInMonth(c, '2026-02')).toBe(true);
    expect(isBilledInMonth(c, '2026-03')).toBe(false);
    expect(isBilledInMonth(c, '2026-04')).toBe(false);
    expect(isBilledInMonth(c, '2026-05')).toBe(true);
    expect(isBilledInMonth(c, '2026-12')).toBe(false);
  });

  it('computes cumulative balance independent of stops', () => {
    const c = cust();
    const payments = [pay({ month: '2026-01' }), pay({ month: '2026-02', amount: 10 })];
    const ledger = customerLedger(c, payments, '2026-03');
    expect(ledger.map((l) => l.balance)).toEqual([0, 10, 30]);
    expect(balanceAsOf(c, payments, '2026-03')).toBe(30);
  });

  it('balance is zero before the start month', () => {
    expect(balanceAsOf(cust(), [], '2025-06')).toBe(0);
  });
});

describe('month summary / P&L', () => {
  const customers = [cust(), cust({ id: 'c2', name: 'Bob', startDate: '2026-02-01' })];
  const payments = [
    pay({ customerId: 'c1', month: '2026-02', amount: 20, receivedDate: '2026-02-05' }),
    pay({ customerId: 'c2', month: '2026-02', amount: 20, receivedDate: '2026-02-06' }),
  ];
  const expenses: Expense[] = [
    { id: 'e1', date: '2026-02-10', amount: 12.5, category: 'Fuel', payee: 'Shell', note: '', receiptRef: '' },
    { id: 'e2', date: '2026-02-11', amount: 7.5, category: 'Fuel', payee: 'Shell', note: '', receiptRef: '' },
    { id: 'e3', date: '2026-03-01', amount: 50, category: 'Supplies', payee: 'X', note: '', receiptRef: '' },
  ];
  const payouts: Payout[] = [
    { id: 'p1', memberUid: 'h1', date: '2026-02-15', amount: 15, method: 'cash', basis: 'perDay', note: '' },
    { id: 'p2', memberUid: 'h1', date: '2026-03-15', amount: 15, method: 'cash', basis: 'perDay', note: '' },
  ];

  it('totals billed, collected, helper pay, expenses and net (cash basis)', () => {
    const s = monthSummary('2026-02', customers, payments, expenses, payouts);
    expect(s.billed).toBe(40);
    expect(s.collected).toBe(40);
    expect(s.outstanding).toBe(0);
    expect(s.helperPay).toBe(15);
    expect(s.expenses).toBe(20);
    expect(s.net).toBe(5);
  });

  it('reports outstanding when unpaid', () => {
    const s = monthSummary('2026-03', customers, payments, expenses, payouts);
    expect(s.billed).toBe(40);
    expect(s.collected).toBe(0);
    expect(s.outstanding).toBe(40);
    expect(s.net).toBe(-65);
  });

  it('groups expenses and payouts and flags threshold', () => {
    expect(expensesByCategory(expenses)).toEqual({ Fuel: 20, Supplies: 50 });
    const totals = payoutsByMember([...payouts, { ...payouts[0], id: 'p3', amount: 600 }]);
    expect(totals.h1).toBe(630);
    expect(overThreshold(totals, 600)).toEqual(['h1']);
    expect(overThreshold({ h2: 599.99 }, 600)).toEqual([]);
  });

  it('monthKey handles strings and dates', () => {
    expect(monthKey('2026-07-04')).toBe('2026-07');
    expect(monthKey(new Date(2026, 6, 4))).toBe('2026-07');
  });
});
