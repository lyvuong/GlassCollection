import { useState } from 'react';
import { useAuth } from '../auth';
import { newId, save } from '../lib/data';
import { optimizeRoute } from '../lib/routing';
import { isPausedNow, todayISO } from '../lib/billing';
import { useCustomers, useMembers, useNeighborhoods, useRoutes } from '../hooks';
import type { CollectionRoute } from '../lib/types';
import { setDoc, doc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';

export default function Plan() {
  const { user } = useAuth();
  const { data: areas } = useNeighborhoods();
  const { data: routes } = useRoutes();
  const { data: customers } = useCustomers();
  const { data: members } = useMembers();
  const [areaId, setAreaId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [plan, setPlan] = useState<Record<string, CollectionRoute>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const area = areas.find((a) => a.id === (areaId || areas[0]?.id));
  const areaRoutes = routes.filter((r) => r.neighborhoodId === area?.id).sort((a, b) => a.order - b.order);
  const active = customers.filter((c) => c.neighborhoodId === area?.id && !isPausedNow(c));
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? id;

  async function optimize() {
    if (!area) return;
    if (area.homeLat == null || area.homeLng == null) { setMsg('Locate the home base address first (Areas).'); return; }
    setBusy(true);
    setMsg('Optimizing…');
    const origin = { lat: area.homeLat, lng: area.homeLng };
    const dest = area.centerLat != null && area.centerLng != null ? { lat: area.centerLat, lng: area.centerLng } : origin;
    const next: Record<string, CollectionRoute> = {};
    let usedLocal = false;
    const missing: string[] = [];
    for (const r of areaRoutes) {
      const mine = active.filter((c) => c.routeId === r.id);
      const pts = mine.filter((c) => c.lat != null && c.lng != null).map((c) => ({ id: c.id, lat: c.lat!, lng: c.lng! }));
      mine.filter((c) => c.lat == null).forEach((c) => missing.push(c.name));
      if (mine.length === 0) continue;
      const res = await optimizeRoute(origin, dest, pts);
      if (res.provider === 'local') usedLocal = true;
      const unlocated = mine.filter((c) => c.lat == null).map((c) => c.id);
      next[r.id] = {
        assigneeUid: plan[r.id]?.assigneeUid ?? '',
        order: [...res.order, ...unlocated],
        plannedDistance: Math.round(res.distanceMeters),
        plannedDuration: Math.round(res.durationSeconds),
      };
    }
    setPlan(next);
    setBusy(false);
    setMsg(
      (usedLocal ? 'Optimized with the built-in optimizer (add a Google Maps key for road-based routing). ' : 'Optimized with Google Maps. ')
      + (missing.length ? `No map pin for: ${missing.join(', ')} (added at the end).` : ''),
    );
  }

  function move(rid: string, idx: number, dir: -1 | 1) {
    const order = [...plan[rid].order];
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    setPlan({ ...plan, [rid]: { ...plan[rid], order } });
  }

  async function create() {
    if (!area || !user) return;
    const routeIds = Object.keys(plan).filter((k) => plan[k].order.length);
    if (!routeIds.length) { setMsg('Optimize first.'); return; }
    setBusy(true);
    const id = newId('collections');
    await save(`collections/${id}`, {
      date, neighborhoodId: area.id, routeIds, status: 'open', createdAt: Date.now(),
      routes: Object.fromEntries(routeIds.map((r) => [r, { ...plan[r], assigneeUid: plan[r].assigneeUid || '' }])),
    }, false);
    for (const rid of routeIds) {
      for (const cid of plan[rid].order) {
        await setDoc(doc(getDb(), `collections/${id}/stops/${cid}`), { routeId: rid, status: 'pending', note: '' });
      }
    }
    setBusy(false);
    setPlan({});
    setMsg(`Pickup day created for ${date}. Helpers see it on the Collect screen.`);
  }

  const km = (m?: number) => (m ? `${(m / 1609.34).toFixed(1)} mi` : '-');
  const mins = (s?: number) => (s ? `${Math.round(s / 60)} min` : '-');

  return (
    <>
      <h1>Plan a pickup day</h1>
      <div className="card grid2">
        <label>Neighborhood
          <select value={area?.id ?? ''} onChange={(e) => { setAreaId(e.target.value); setPlan({}); }}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <p className="muted">{active.length} active subscribers in {areaRoutes.length} route(s). Paused subscribers are skipped.</p>
      <div className="row">
        <button disabled={busy || !area} onClick={optimize}>Optimize routes</button>
        <button disabled={busy || !Object.keys(plan).length} className="warn" onClick={create}>Create pickup day</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {areaRoutes.map((r) => plan[r.id] && (
        <div className="card" key={r.id} style={{ borderLeft: `6px solid ${r.color}` }}>
          <div className="row">
            <h3 className="grow">{r.name}: {plan[r.id].order.length} stops · {km(plan[r.id].plannedDistance)} · {mins(plan[r.id].plannedDuration)}</h3>
            <label style={{ margin: 0 }}>Assign to
              <select value={plan[r.id].assigneeUid ?? ''} onChange={(e) => setPlan({ ...plan, [r.id]: { ...plan[r.id], assigneeUid: e.target.value } })}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.uid} value={m.uid}>{m.displayName} ({m.role})</option>)}
              </select>
            </label>
          </div>
          <ol>
            {plan[r.id].order.map((cid, i) => (
              <li key={cid}>
                {nameOf(cid)} <span className="muted">{customers.find((c) => c.id === cid)?.address}</span>{' '}
                <button className="ghost small" onClick={() => move(r.id, i, -1)}>↑</button>{' '}
                <button className="ghost small" onClick={() => move(r.id, i, 1)}>↓</button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}
