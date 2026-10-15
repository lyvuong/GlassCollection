import { googleMapsKey } from './firebase';
import { chunk, haversine, localOptimize, nearestNeighbor, pathLength, type LatLng, type Point } from './geo';

export interface GeocodeResult extends LatLng {
  formatted: string;
}

export interface OptimizeResult {
  order: string[]; // point ids in visiting order
  distanceMeters: number;
  durationSeconds: number;
  provider: 'google' | 'local';
}

/** Geocode an address. Uses Google if a key is configured, otherwise OpenStreetMap Nominatim. */
export async function geocode(address: string): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;
  if (googleMapsKey) {
    try {
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${googleMapsKey}`,
      );
      const j = await r.json();
      const hit = j.results?.[0];
      if (hit) {
        return { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, formatted: hit.formatted_address };
      }
    } catch {
      /* fall through to Nominatim */
    }
  }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    const j = await r.json();
    if (j?.[0]) return { lat: Number(j[0].lat), lng: Number(j[0].lon), formatted: j[0].display_name };
  } catch {
    /* ignore */
  }
  return null;
}

const MAX_INTERMEDIATES = 25;

interface GoogleLeg {
  order: number[];
  distance: number;
  duration: number;
}

async function googleOptimize(origin: LatLng, destination: LatLng, stops: Point[]): Promise<GoogleLeg> {
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    intermediates: stops.map((s) => ({ location: { latLng: { latitude: s.lat, longitude: s.lng } } })),
    travelMode: 'DRIVE',
    optimizeWaypointOrder: true,
  };
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsKey!,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Routes API ${r.status}`);
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) throw new Error('No route returned');
  const order: number[] = route.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i);
  return {
    order,
    distance: route.distanceMeters ?? 0,
    duration: parseInt(String(route.duration ?? '0').replace('s', ''), 10) || 0,
  };
}

/**
 * Optimize visiting order. Origin = home base, destination = recycling center (or origin).
 * Lists over 25 stops are pre-ordered locally then optimized in chunks, chained leg to leg.
 */
export async function optimizeRoute(origin: LatLng, destination: LatLng | undefined, stops: Point[]): Promise<OptimizeResult> {
  const dest = destination ?? origin;
  if (stops.length === 0) return { order: [], distanceMeters: 0, durationSeconds: 0, provider: 'local' };

  if (googleMapsKey) {
    try {
      const pre = stops.length > MAX_INTERMEDIATES ? nearestNeighbor(origin, stops) : stops;
      const groups = chunk(pre, MAX_INTERMEDIATES);
      const ordered: Point[] = [];
      let dist = 0;
      let dur = 0;
      let from = origin;
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const to = g === groups.length - 1 ? dest : group[group.length - 1];
        const leg = await googleOptimize(from, to, g === groups.length - 1 ? group : group.slice(0, -1));
        const inner = g === groups.length - 1 ? group : group.slice(0, -1);
        const seq = leg.order.map((i) => inner[i]);
        if (g < groups.length - 1) seq.push(group[group.length - 1]);
        ordered.push(...seq);
        dist += leg.distance;
        dur += leg.duration;
        from = seq[seq.length - 1];
      }
      return { order: ordered.map((p) => p.id), distanceMeters: dist, durationSeconds: dur, provider: 'google' };
    } catch (e) {
      console.warn('Google routing failed, using local optimizer', e);
    }
  }

  const ordered = localOptimize(origin, stops, dest);
  // Straight-line length x 1.3 approximates road distance; assume ~30 km/h neighborhood driving.
  const dist = pathLength(origin, ordered, dest) * 1.3;
  return { order: ordered.map((p) => p.id), distanceMeters: dist, durationSeconds: dist / (30000 / 3600), provider: 'local' };
}

/** Deep link that opens turn-by-turn navigation to an address in the phone's maps app. */
export function navigateUrl(address: string, lat?: number, lng?: number): string {
  const dest = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

export { haversine };
