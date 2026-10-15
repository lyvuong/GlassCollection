import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { visitOrder } from '../lib/geo';
import type { Customer, Stop, RouteDoc } from '../lib/types';

const COLORS: Record<Stop['status'], string> = {
  collected: '#2e9e62', nothing_out: '#8a9690', skipped: '#d97706', pending: '#ffffff',
};

interface Props {
  customers: Customer[];
  stops: Stop[];
  routes: RouteDoc[];
  plannedOrder?: string[];
}

/** Map of a pickup day: stops colored by outcome, numbered in visit order, linked by a thin line. */
export default function PickupMap({ customers, stops, routes, plannedOrder }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current).setView([39.5, -98.35], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g || !map.current) return;
    g.clearLayers();
    const ordered = visitOrder(stops);
    const pts: L.LatLngTuple[] = [];
    ordered.forEach((s, i) => {
      const c = customers.find((x) => x.id === s.id);
      if (!c || c.lat == null || c.lng == null) return;
      const route = routes.find((r) => r.id === s.routeId);
      const visited = s.status !== 'pending';
      const n = visited ? String(ordered.filter((o) => o.checkedAt != null).indexOf(s) + 1 || i + 1) : '';
      const border = route?.color ?? '#1f7a4d';
      const icon = L.divIcon({
        className: '',
        html: `<div class="pin" style="background:${COLORS[s.status]};color:${s.status === 'pending' ? '#333' : '#fff'};border-color:${border}">${n}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      });
      const when = s.checkedAt ? new Date(s.checkedAt).toLocaleTimeString() : 'not visited';
      L.marker([c.lat, c.lng], { icon }).bindPopup(`<b>${escapeHtml(c.name)}</b><br>${escapeHtml(c.address)}<br>${s.status.replace('_', ' ')} · ${when}`).addTo(g);
      if (visited) pts.push([c.lat, c.lng]);
      if (s.checkedLat != null && s.checkedLng != null) {
        const d = map.current!.distance([c.lat, c.lng], [s.checkedLat, s.checkedLng]);
        if (d > 50) L.circleMarker([s.checkedLat, s.checkedLng], { radius: 4, color: '#b3261e' }).bindPopup('Check-off location (far from address)').addTo(g);
      }
    });
    if (pts.length > 1) L.polyline(pts, { color: '#1f7a4d', weight: 2, opacity: 0.7 }).addTo(g);
    if (plannedOrder) {
      const p = plannedOrder.map((id) => customers.find((c) => c.id === id)).filter((c) => c?.lat != null).map((c) => [c!.lat!, c!.lng!] as L.LatLngTuple);
      if (p.length > 1) L.polyline(p, { color: '#2563eb', weight: 2, dashArray: '6 6', opacity: 0.6 }).addTo(g);
    }
    const all = [...pts, ...stops.map((s) => customers.find((c) => c.id === s.id)).filter((c) => c?.lat != null).map((c) => [c!.lat!, c!.lng!] as L.LatLngTuple)];
    if (all.length) map.current.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 17 });
  }, [customers, stops, routes, plannedOrder]);

  return <div ref={el} className="map" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
