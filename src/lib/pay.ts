import type { PayRuleType, Stop } from './types';
import { round2 } from './billing';

export interface PayRule {
  type: PayRuleType;
  rate: number;
}

/** Number of stops that were actually visited (anything but pending). */
export function visitedCount(stops: Pick<Stop, 'status'>[]): number {
  return stops.filter((s) => s.status !== 'pending').length;
}

/** Suggested payout for a helper for one pickup day. */
export function suggestPayout(rule: PayRule | undefined, stops: Pick<Stop, 'status'>[], hours = 0): number {
  if (!rule) return 0;
  switch (rule.type) {
    case 'perDay':
      return round2(rule.rate);
    case 'perStop':
      return round2(rule.rate * visitedCount(stops));
    case 'hourly':
      return round2(rule.rate * hours);
  }
}
