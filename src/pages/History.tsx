import { useState } from 'react';
import { collection as fsCollection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { useAuth } from '../auth';
import { newId, patch, save, useCollection } from '../lib/data';
import { suggestPayout } from '../lib/pay';
import { locationMismatch } from '../lib/geo';
import { dataUrl } from '../lib/photo';
import { outcomeLabel } from '../lib/pdf';
import { todayISO } from '../lib/billing';
import PickupMap from '../components/PickupMap';
import { useCustomers, useMembers, useNeighborhoods, useRoutes } from '../hooks';
import type { Collection, PhotoDoc, Stop } from '../lib/types';

export default function History() {
  const { data: collections } = useCollection<Collection>('collections');
  const { data: areas } = useNeighborhoods();
  const [openId, setOpenId] = useState('');
  const sorted = [...collections].sort((a, b) => b.date.localeCompare(a.date));
  const current = collections.find((c) => c.id === openId);
  if (current) return <Detail collection={current} onBack={() => setOpenId('')} />;
  return (
    <>
      <h1>Pickup history</h1>
      {sorted.map((c) => (
        <div className="card row" key={c.id}>
          <span className="grow">{c.date} · {areas.find((a) => a.id === c.neighborhoodId)?.name ?? ''}</span>
          <span className={`badge ${c.status === 'open' ? 'skipped' : 'collected'}`}>{c.status}</span>
          <button className="small" onClick={() => setOpenId(c.id)}>View</button>
        </div>
      ))}
      {sorted.length === 0 && <p className="muted">No pickup days yet.</p>}
    </>
  );
}

function Detail({ collection, onBack }: { collection: Collection; onBack: () => void }) {
  const { settings } = useAuth();
  const { data: stops } = useCollection<Stop>(`collections/${collection.id}/stops`);
  const { data: customers } = useCustomers();
  const { data: routes } = useRoutes();
  const { data: members } = useMembers();
  const [photoCache, setPhotoCache] = useState<Record<string, PhotoDoc[]>>({});
  const [msg, setMsg] = useState('');
  const nameOf = (uid?: string) => members.find((m) => m.uid === uid)?.displayName ?? '';

  async function loadPhotos(cid: string) {
    const snap = await getDocs(fsCollection(getDb(), `collections/${collection.id}/stops/${cid}/photos`));
    setPhotoCache((p) => ({ ...p, [cid]: snap.docs.map((d) => ({ ...(d.data() as PhotoDoc), id: d.id })) }));
  }

  async function closeDay() {
    if (!confirm('Close this pickup day? Helpers will no longer see it.')) return;
    await patch(`collections/${collection.id}`, { status: 'closed' });
    // Suggest helper payouts.
    const date = todayISO();
    for (const rid of collection.routeIds) {
      const uid = collection.routes[rid]?.assigneeUid;
      const m = members.find((x) => x.uid === uid);
      if (!m?.payRule) continue;
      const mine = stops.filter((s) => s.routeId === rid);
      const amount = suggestPayout(m.payRule, mine);
      if (amount > 0 && confirm(`Record payout of $${amount.toFixed(2)} to ${m.displayName} for ${routes.find((r) => r.id === rid)?.name}?`)) {
        await save(`payouts/${newId('payouts')}`, {
          memberUid: m.uid, date, amount, method: 'cash', collectionId: collection.id, basis: m.payRule.type, note: `Pickup ${collection.date}`,
        }, false);
      }
    }
    setMsg('Day closed.');
  }

  async function reopen() { await patch(`collections/${collection.id}`, { status: 'open' }); }

  async function pruneOldPhotos() {
    const cutoff = Date.now() - settings.photoRetentionDays * 86400000;
    let n = 0;
    for (const s of stops) {
      const snap = await getDocs(fsCollection(getDb(), `collections/${collection.id}/stops/${s.id}/photos`));
      for (const d of snap.docs) {
        if ((d.data() as PhotoDoc).takenAt < cutoff) { await deleteDoc(doc(getDb(), d.ref.path)); n++; }
      }
    }
    setMsg(`${n} photo(s) older than ${settings.photoRetentionDays} days removed.`);
  }

  const counts = (s: Stop['status']) => stops.filter((x) => x.status === s).length;
  const routeOrder = collection.routeIds.flatMap((r) => collection.routes[r]?.order ?? []);

  return (
    <>
      <div className="row"><button className="ghost small" onClick={onBack}>Back</button><h1 className="grow">Pickup {collection.date}</h1></div>
      <p className="muted">
        Collected {counts('collected')} · Nothing out {counts('nothing_out')} · Skipped {counts('skipped')} · Not visited {counts('pending')}
      </p>
      <div className="row">
        {collection.status === 'open' ? <button onClick={closeDay}>Close day and suggest payouts</button> : <button className="ghost" onClick={reopen}>Reopen</button>}
        <button className="ghost" onClick={pruneOldPhotos}>Remove old photos</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <PickupMap customers={customers} stops={stops} routes={routes} plannedOrder={routeOrder} />
      <p className="muted">Solid line: order visited. Dashed blue: planned order. Red dot: check-off far from the address.</p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Subscriber</th><th>Result</th><th>Time</th><th>By</th><th>Photos</th></tr></thead>
          <tbody>
            {stops.map((s) => {
              const c = customers.find((x) => x.id === s.id);
              const far = locationMismatch(
                s.checkedLat != null ? { lat: s.checkedLat, lng: s.checkedLng! } : undefined,
                c?.lat != null ? { lat: c.lat, lng: c.lng! } : undefined,
              );
              return (
                <tr key={s.id}>
                  <td>{c?.name ?? s.id}<div className="muted">{c?.address}</div></td>
                  <td><span className={`badge ${s.status}`}>{outcomeLabel(s.status)}</span>{far && <> <span className="badge skipped">far from address</span></>}{s.note && <div className="muted">{s.note}</div>}</td>
                  <td>{s.checkedAt ? new Date(s.checkedAt).toLocaleTimeString() : ''}</td>
                  <td>{nameOf(s.checkedBy)}</td>
                  <td>
                    {photoCache[s.id] ? (
                      <div className="thumbs">{photoCache[s.id].map((p) => <img key={p.id} src={dataUrl(p.jpegBase64)} alt="" />)}{photoCache[s.id].length === 0 && <span className="muted">none</span>}</div>
                    ) : <button className="ghost small" onClick={() => loadPhotos(s.id)}>Show</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

