export interface LatLng {
  lat: number;
  lng: number;
}
export interface Point extends LatLng {
  id: string;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total length of origin -> points in order -> destination (meters, straight-line). */
export function pathLength(origin: LatLng, order: Point[], destination?: LatLng): number {
  let total = 0;
  let prev: LatLng = origin;
  for (const p of order) {
    total += haversine(prev, p);
    prev = p;
  }
  if (destination) total += haversine(prev, destination);
  return total;
}

/** Greedy nearest-neighbor ordering starting from origin. */
export function nearestNeighbor(origin: LatLng, points: Point[]): Point[] {
  const left = [...points];
  const out: Point[] = [];
  let cur: LatLng = origin;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = haversine(cur, left[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    const [n] = left.splice(bi, 1);
    out.push(n);
    cur = n;
  }
  return out;
}

/** 2-opt improvement of an open path from origin to optional destination. */
export function twoOpt(origin: LatLng, order: Point[], destination?: LatLng): Point[] {
  const best = [...order];
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        if (pathLength(origin, cand, destination) + 1e-6 < pathLength(origin, best, destination)) {
          best.splice(0, best.length, ...cand);
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Local fallback optimizer: nearest neighbor then 2-opt. */
export function localOptimize(origin: LatLng, points: Point[], destination?: LatLng): Point[] {
  if (points.length < 3) return nearestNeighbor(origin, points);
  return twoOpt(origin, nearestNeighbor(origin, points), destination);
}

/** Split an ordered list into chunks of at most `size` (Google Routes allows 25 intermediates). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Position order by timestamp: visited stops sorted by checkedAt, unvisited at the end. */
export function visitOrder<T extends { checkedAt?: number }>(stops: T[]): T[] {
  const visited = stops.filter((s) => s.checkedAt != null).sort((a, b) => (a.checkedAt! - b.checkedAt!));
  const rest = stops.filter((s) => s.checkedAt == null);
  return [...visited, ...rest];
}

/** True when a photo/check-off GPS stamp is far from the subscriber's address. */
export function locationMismatch(stamp: LatLng | undefined, address: LatLng | undefined, thresholdMeters = 50): boolean {
  if (!stamp || !address) return false;
  return haversine(stamp, address) > thresholdMeters;
}
