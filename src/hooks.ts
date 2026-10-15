import { useCollection } from './lib/data';
import type { Customer, Member, Neighborhood, RouteDoc } from './lib/types';

export function useNeighborhoods() {
  return useCollection<Neighborhood>('neighborhoods');
}
export function useRoutes() {
  return useCollection<RouteDoc>('routes');
}
export function useCustomers(enabled = true) {
  return useCollection<Customer>(enabled ? 'customers' : null);
}
export function useMembers(enabled = true) {
  const r = useCollection<Member & { id: string }>(enabled ? 'members' : null);
  return { ...r, data: r.data.map((m) => ({ ...m, uid: m.id })) as Member[] };
}

export const ROUTE_COLORS = ['#1f7a4d', '#2563eb', '#c026d3', '#d97706', '#0891b2', '#dc2626', '#7c3aed', '#4d7c0f'];
