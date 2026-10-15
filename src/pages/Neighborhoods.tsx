import { useState } from 'react';
import { useAuth } from '../auth';
import { newId, remove, save } from '../lib/data';
import { geocode } from '../lib/routing';
import { ROUTE_COLORS, useNeighborhoods, useRoutes } from '../hooks';
import type { Neighborhood, StopStatus } from '../lib/types';

export default function Neighborhoods() {
  const { isOwner, settings } = useAuth();
  const { data: areas } = useNeighborhoods();
  const { data: routes } = useRoutes();
  const [msg, setMsg] = useState('');

  async function addArea() {
    const id = newId('neighborhoods');
    await save(`neighborhoods/${id}`, {
      name: 'New neighborhood', homeAddress: '', centerAddress: '', monthlyFee: settings.defaultFee,
      photoRequiredFor: ['nothing_out', 'skipped'], notes: '',
    }, false);
    const rid = newId('routes');
    await save(`routes/${rid}`, { neighborhoodId: id, name: 'Route 1', color: ROUTE_COLORS[0], order: 0 }, false);
  }

  async function update(a: Neighborhood, patchData: Partial<Neighborhood>) {
    await save(`neighborhoods/${a.id}`, patchData);
  }

  async function geocodeAddresses(a: Neighborhood) {
    setMsg('Looking up addresses…');
    const home = a.homeAddress ? await geocode(a.homeAddress) : null;
    const center = a.centerAddress ? await geocode(a.centerAddress) : null;
    await save(`neighborhoods/${a.id}`, {
      homeLat: home?.lat ?? null, homeLng: home?.lng ?? null, centerLat: center?.lat ?? null, centerLng: center?.lng ?? null,
    });
    setMsg(home || center ? 'Addresses located.' : 'Could not find those addresses.');
  }

  async function addRoute(a: Neighborhood) {
    const mine = routes.filter((r) => r.neighborhoodId === a.id);
    const id = newId('routes');
    await save(`routes/${id}`, {
      neighborhoodId: a.id, name: `Route ${mine.length + 1}`, color: ROUTE_COLORS[mine.length % ROUTE_COLORS.length], order: mine.length,
    }, false);
  }

  const toggleStatus = (a: Neighborhood, s: StopStatus) => {
    const set = new Set(a.photoRequiredFor ?? []);
    set.has(s) ? set.delete(s) : set.add(s);
    return update(a, { photoRequiredFor: [...set] });
  };

  return (
    <>
      <h1>Neighborhoods and routes</h1>
      <p className="muted">A neighborhood is a service area. Split it into routes so helpers can each take a group of subscribers.</p>
      {isOwner && <button onClick={addArea}>Add neighborhood</button>}
      {msg && <p className="muted">{msg}</p>}
      {areas.map((a) => (
        <div className="card" key={a.id}>
          <label>Name<input defaultValue={a.name} disabled={!isOwner} onBlur={(e) => update(a, { name: e.target.value })} /></label>
          <div className="grid2">
            <label>Home base address (route starts here)<input defaultValue={a.homeAddress} disabled={!isOwner} onBlur={(e) => update(a, { homeAddress: e.target.value })} /></label>
            <label>Recycling center address (route ends here)<input defaultValue={a.centerAddress} disabled={!isOwner} onBlur={(e) => update(a, { centerAddress: e.target.value })} /></label>
            <label>Monthly fee<input type="number" step="0.01" defaultValue={a.monthlyFee} disabled={!isOwner} onBlur={(e) => update(a, { monthlyFee: Number(e.target.value) })} /></label>
          </div>
          <div className="row">
            <span className="muted">Photo required for:</span>
            {(['collected', 'nothing_out', 'skipped'] as StopStatus[]).map((s) => (
              <label key={s} style={{ margin: 0 }}>
                <input type="checkbox" disabled={!isOwner} checked={(a.photoRequiredFor ?? []).includes(s)} onChange={() => toggleStatus(a, s)} />
                {s === 'collected' ? 'Collected' : s === 'nothing_out' ? 'Nothing out' : 'Skipped'}
              </label>
            ))}
          </div>
          <p className="muted">
            Home: {a.homeLat != null ? `${a.homeLat.toFixed(4)}, ${a.homeLng!.toFixed(4)}` : 'not located'} · Center:{' '}
            {a.centerLat != null ? `${a.centerLat.toFixed(4)}, ${a.centerLng!.toFixed(4)}` : 'not located'}
          </p>
          {isOwner && <button className="ghost small" onClick={() => geocodeAddresses(a)}>Locate addresses</button>}
          <h3>Routes</h3>
          {routes.filter((r) => r.neighborhoodId === a.id).sort((x, y) => x.order - y.order).map((r) => (
            <div className="row" key={r.id}>
              <input type="color" style={{ width: 44, padding: 2 }} defaultValue={r.color} disabled={!isOwner} onBlur={(e) => save(`routes/${r.id}`, { color: e.target.value })} />
              <input className="grow" defaultValue={r.name} disabled={!isOwner} onBlur={(e) => save(`routes/${r.id}`, { name: e.target.value })} />
              {isOwner && <button className="danger small" onClick={() => confirm(`Delete ${r.name}? Move its subscribers first.`) && remove(`routes/${r.id}`)}>Delete</button>}
            </div>
          ))}
          {isOwner && <button className="ghost small" onClick={() => addRoute(a)}>Add route</button>}
        </div>
      ))}
      {areas.length === 0 && <p>No neighborhoods yet.{isOwner ? ' Add one to begin.' : ' Ask the owner to add one.'}</p>}
    </>
  );
}
