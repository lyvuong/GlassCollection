import { describe, it, expect } from 'vitest';
import { haversine, nearestNeighbor, localOptimize, pathLength, chunk, visitOrder, locationMismatch } from './geo';
import { suggestPayout, visitedCount } from './pay';

const p = (id: string, lat: number, lng: number) => ({ id, lat, lng });

describe('geo', () => {
  it('haversine ~111km per degree latitude', () => {
    const d = haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112500);
  });

  it('nearest neighbor visits points along a line in order', () => {
    const origin = { lat: 0, lng: 0 };
    const pts = [p('c', 0, 0.03), p('a', 0, 0.01), p('b', 0, 0.02)];
    expect(nearestNeighbor(origin, pts).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('2-opt never makes the route longer than nearest neighbor', () => {
    const origin = { lat: 0, lng: 0 };
    const pts = Array.from({ length: 12 }, (_, i) => p(String(i), Math.sin(i * 7) * 0.02, Math.cos(i * 3) * 0.02));
    const nn = nearestNeighbor(origin, pts);
    const opt = localOptimize(origin, pts);
    expect(opt).toHaveLength(12);
    expect(new Set(opt.map((x) => x.id)).size).toBe(12);
    expect(pathLength(origin, opt)).toBeLessThanOrEqual(pathLength(origin, nn) + 1e-6);
  });

  it('chunks into groups of 25', () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    const c = chunk(items, 25);
    expect(c.map((x) => x.length)).toEqual([25, 25, 10]);
  });

  it('visit order sorts by timestamp with unvisited last', () => {
    const o = visitOrder([{ checkedAt: 30 }, {}, { checkedAt: 10 }, { checkedAt: 20 }]);
    expect(o.map((x) => x.checkedAt)).toEqual([10, 20, 30, undefined]);
  });

  it('flags photo location far from the address', () => {
    const addr = { lat: 40, lng: -75 };
    expect(locationMismatch({ lat: 40.0001, lng: -75 }, addr)).toBe(false);
    expect(locationMismatch({ lat: 40.01, lng: -75 }, addr)).toBe(true);
    expect(locationMismatch(undefined, addr)).toBe(false);
  });
});

describe('helper pay', () => {
  const stops = [{ status: 'collected' }, { status: 'nothing_out' }, { status: 'skipped' }, { status: 'pending' }] as const;
  it('counts visited stops', () => {
    expect(visitedCount([...stops])).toBe(3);
  });
  it('per day, per stop, hourly', () => {
    expect(suggestPayout({ type: 'perDay', rate: 25 }, [...stops])).toBe(25);
    expect(suggestPayout({ type: 'perStop', rate: 1.5 }, [...stops])).toBe(4.5);
    expect(suggestPayout({ type: 'hourly', rate: 12 }, [...stops], 2.5)).toBe(30);
    expect(suggestPayout(undefined, [...stops])).toBe(0);
  });
});
