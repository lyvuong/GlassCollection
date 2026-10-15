import { useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { newId, remove, save } from '../lib/data';
import { geocode } from '../lib/routing';
import { isPausedNow, monthKey, todayISO } from '../lib/billing';
import { useCustomers, useNeighborhoods, useRoutes } from '../hooks';
import type { Customer, EmailFrequency } from '../lib/types';

const blank = (neighborhoodId: string, routeId: string, fee: number): Omit<Customer, 'id'> => ({
  name: '', address: '', phone: '', email: '', notes: '', neighborhoodId, routeId,
  startDate: todayISO(), pauses: [], monthlyFee: fee, emailOptIn: true, emailFrequency: 'pickup',
});

export default function Customers() {
  const { settings } = useAuth();
  const { data: customers } = useCustomers();
  const { data: areas } = useNeighborhoods();
  const { data: routes } = useRoutes();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<(Omit<Customer, 'id'> & { id?: string }) | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const shown = useMemo(
    () => customers
      .filter((c) => (!filter || c.neighborhoodId === filter) && (!q || (c.name + c.address).toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [customers, filter, q],
  );
  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? '-';
  const routeName = (id: string) => routes.find((r) => r.id === id)?.name ?? '-';

  function startNew() {
    const a = areas.find((x) => x.id === filter) ?? areas[0];
    if (!a) { setMsg('Add a neighborhood first (Areas).'); return; }
    const r = routes.filter((x) => x.neighborhoodId === a.id).sort((x, y) => x.order - y.order)[0];
    setEditing(blank(a.id, r?.id ?? '', a.monthlyFee || settings.defaultFee));
  }

  async function saveEditing() {
    if (!editing) return;
    setBusy(true);
    const id = editing.id ?? newId('customers');
    const prev = customers.find((c) => c.id === id);
    let geo: { lat?: number; lng?: number } = { lat: prev?.lat, lng: prev?.lng };
    if (!prev || prev.address !== editing.address || prev.lat == null) {
      const g = await geocode(editing.address);
      if (g) geo = { lat: g.lat, lng: g.lng };
      else setMsg('Saved, but the address could not be located on the map. Check the spelling.');
    }
    await save(`customers/${id}`, { ...editing, ...geo });
    setEditing(null);
    setBusy(false);
  }

  async function moveSelected(routeId: string) {
    const r = routes.find((x) => x.id === routeId);
    if (!r) return;
    await Promise.all([...selected].map((id) => save(`customers/${id}`, { routeId, neighborhoodId: r.neighborhoodId })));
    setSelected(new Set());
  }

  async function togglePause(c: Customer) {
    const m = monthKey(new Date());
    const paused = isPausedNow(c);
    let pauses = [...(c.pauses ?? [])];
    if (paused) {
      pauses = pauses.map((p) => (m >= p.from && (!p.to || m <= p.to) ? { from: p.from, to: prevMonth(m) } : p)).filter((p) => !p.to || p.to >= p.from);
    } else {
      pauses.push({ from: m });
    }
    await save(`customers/${c.id}`, { pauses });
  }

  if (editing) {
    const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setEditing({ ...editing, [k]: v });
    const areaRoutes = routes.filter((r) => r.neighborhoodId === editing.neighborhoodId);
    return (
      <>
        <h1>{editing.id ? 'Edit subscriber' : 'New subscriber'}</h1>
        <div className="card">
          <label>Name<input value={editing.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label>Address (street, city, state)<input value={editing.address} onChange={(e) => set('address', e.target.value)} /></label>
          <div className="grid2">
            <label>Phone<input value={editing.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label>Email<input type="email" value={editing.email} onChange={(e) => set('email', e.target.value)} /></label>
            <label>Neighborhood
              <select value={editing.neighborhoodId} onChange={(e) => {
                const nid = e.target.value;
                const r = routes.filter((x) => x.neighborhoodId === nid).sort((x, y) => x.order - y.order)[0];
                setEditing({ ...editing, neighborhoodId: nid, routeId: r?.id ?? '' });
              }}>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label>Route
              <select value={editing.routeId} onChange={(e) => set('routeId', e.target.value)}>
                {areaRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label>Monthly fee<input type="number" step="0.01" value={editing.monthlyFee} onChange={(e) => set('monthlyFee', Number(e.target.value))} /></label>
            <label>Service start date<input type="date" value={editing.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          </div>
          <label>Notes for the pickup team (e.g. "bin on left of driveway")<textarea value={editing.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <label><input type="checkbox" checked={editing.emailOptIn} onChange={(e) => set('emailOptIn', e.target.checked)} />Send email notices</label>
          <label>Email frequency
            <select value={editing.emailFrequency} onChange={(e) => set('emailFrequency', e.target.value as EmailFrequency)}>
              <option value="pickup">Every pickup + monthly statement</option>
              <option value="monthly">Monthly summary only</option>
              <option value="statementOnly">Statement only</option>
            </select>
          </label>
          <div className="row">
            <button disabled={busy || !editing.name || !editing.address} onClick={saveEditing}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
            {editing.id && <button className="danger" onClick={async () => { if (confirm('Delete this subscriber? Their history stays in past reports only if you pause instead.')) { await remove(`customers/${editing.id}`); setEditing(null); } }}>Delete</button>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Subscribers ({shown.length})</h1>
      <div className="row">
        <select className="grow" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All neighborhoods</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="grow" placeholder="Search name or address" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={startNew}>Add subscriber</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {selected.size > 0 && (
        <div className="card row">
          <span>{selected.size} selected. Move to route:</span>
          <select defaultValue="" onChange={(e) => e.target.value && moveSelected(e.target.value)}>
            <option value="">Choose…</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{areaName(r.neighborhoodId)} / {r.name}</option>)}
          </select>
          <button className="ghost small" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th /><th>Name</th><th>Address</th><th>Area / Route</th><th className="num">Fee</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={selected.has(c.id)} onChange={(e) => {
                  const s = new Set(selected); e.target.checked ? s.add(c.id) : s.delete(c.id); setSelected(s);
                }} /></td>
                <td>{c.name}{isPausedNow(c) && <> <span className="badge">paused</span></>}{c.lat == null && <> <span className="badge skipped">no map pin</span></>}</td>
                <td>{c.address}{c.notes && <div className="muted">{c.notes}</div>}</td>
                <td>{areaName(c.neighborhoodId)} / {routeName(c.routeId)}</td>
                <td className="num">${c.monthlyFee}</td>
                <td>
                  <button className="ghost small" onClick={() => setEditing(c)}>Edit</button>{' '}
                  <button className="ghost small" onClick={() => togglePause(c)}>{isPausedNow(c) ? 'Resume' : 'Pause'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted">No subscribers yet.</p>}
      </div>
    </>
  );
}

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}
