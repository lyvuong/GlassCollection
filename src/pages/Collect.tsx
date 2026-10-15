import { useRef, useState } from 'react';
import { limit, orderBy, where } from 'firebase/firestore';
import { useAuth } from '../auth';
import { newId, patch, save, useCollection } from '../lib/data';
import { compressImage, dataUrl, getGpsStamp } from '../lib/photo';
import { navigateUrl } from '../lib/routing';
import { useNeighborhoods, useRoutes } from '../hooks';
import type { Collection, Customer, PhotoDoc, Stop, StopStatus } from '../lib/types';

export default function Collect() {
  const { member, isStaff } = useAuth();
  const routeIds = member?.routeIds ?? [];
  const constraints = isStaff
    ? [where('status', '==', 'open'), limit(10)]
    : routeIds.length ? [where('routeIds', 'array-contains-any', routeIds.slice(0, 30)), limit(10)] : null;
  const { data: all, error } = useCollection<Collection>(constraints ? 'collections' : null, constraints ?? [], [routeIds.join(',')]);
  const collections = all.filter((c) => c.status === 'open').sort((a, b) => b.date.localeCompare(a.date));
  const [openId, setOpenId] = useState('');

  if (!isStaff && routeIds.length === 0) return <p>You have no routes assigned yet. Ask the owner.</p>;
  const current = collections.find((c) => c.id === openId) ?? (collections.length === 1 ? collections[0] : undefined);

  return (
    <>
      <h1>Collection day</h1>
      {error && <p className="error">{error}</p>}
      {!current && (
        <>
          {collections.length === 0 && <p className="muted">No open pickup days.</p>}
          {collections.map((c) => (
            <div className="card row" key={c.id}>
              <span className="grow">{c.date}</span>
              <button onClick={() => setOpenId(c.id)}>Open</button>
            </div>
          ))}
        </>
      )}
      {current && <Day collection={current} onBack={collections.length > 1 ? () => setOpenId('') : undefined} />}
    </>
  );
}

function Day({ collection, onBack }: { collection: Collection; onBack?: () => void }) {
  const { member, isStaff } = useAuth();
  const { data: routes } = useRoutes();
  const { data: areas } = useNeighborhoods();
  const mine = isStaff ? collection.routeIds : collection.routeIds.filter((r) => member!.routeIds.includes(r));
  // Helpers may only query customers on their routes (matches the security rules).
  const { data: customers } = useCollection<Customer>(
    'customers',
    isStaff ? [] : [where('routeId', 'in', mine.slice(0, 30))],
    [mine.join(',')],
  );
  const stopsConstraint = isStaff ? [] : [where('routeId', 'in', mine.slice(0, 30))];
  const { data: stops } = useCollection<Stop>(`collections/${collection.id}/stops`, stopsConstraint, [mine.join(',')]);
  const area = areas.find((a) => a.id === collection.neighborhoodId);
  const [routeFilter, setRouteFilter] = useState(mine[0] ?? '');
  const visibleRoute = mine.includes(routeFilter) ? routeFilter : mine[0];
  const order = collection.routes[visibleRoute]?.order ?? [];
  const stopMap = new Map(stops.map((s) => [s.id, s]));
  const done = order.filter((id) => (stopMap.get(id)?.status ?? 'pending') !== 'pending').length;
  const route = routes.find((r) => r.id === visibleRoute);

  return (
    <>
      <div className="row">
        {onBack && <button className="ghost small" onClick={onBack}>All days</button>}
        <strong className="grow">{collection.date} · {area?.name}</strong>
      </div>
      {mine.length > 1 && (
        <div className="row" style={{ margin: '8px 0' }}>
          {mine.map((r) => (
            <button key={r} className={r === visibleRoute ? '' : 'ghost'} onClick={() => setRouteFilter(r)}>
              {routes.find((x) => x.id === r)?.name ?? r}
            </button>
          ))}
        </div>
      )}
      <p className="muted">{route?.name}: {done} of {order.length} done</p>
      <div className="progress"><div style={{ width: `${order.length ? (done / order.length) * 100 : 0}%` }} /></div>
      {order.map((cid, i) => {
        const c = customers.find((x) => x.id === cid);
        const s = stopMap.get(cid);
        return c && s ? <StopCard key={cid} index={i + 1} collection={collection} customer={c} stop={s} required={area?.photoRequiredFor ?? []} /> : null;
      })}
    </>
  );
}

function StopCard({ index, collection, customer, stop, required }: {
  index: number; collection: Collection; customer: Customer; stop: Stop; required: StopStatus[];
}) {
  const { user } = useAuth();
  const photosPath = `collections/${collection.id}/stops/${customer.id}/photos`;
  const { data: photos } = useCollection<PhotoDoc>(photosPath, [orderBy('takenAt')]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(stop.note ?? '');
  const [err, setErr] = useState('');

  async function addPhoto(file: File) {
    setBusy(true);
    setErr('');
    try {
      const [img, gps] = await Promise.all([compressImage(file), getGpsStamp()]);
      const id = newId(photosPath);
      await save(`${photosPath}/${id}`, {
        jpegBase64: img.base64, width: img.width, height: img.height, takenAt: Date.now(),
        lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, takenBy: user!.uid,
      }, false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the photo');
    }
    setBusy(false);
  }

  async function setStatus(status: StopStatus) {
    if (required.includes(status) && photos.length === 0) {
      setErr('Take a photo of the curb first.');
      return;
    }
    setErr('');
    setBusy(true);
    const gps = await getGpsStamp(4000);
    await patch(`collections/${collection.id}/stops/${customer.id}`, {
      status, note, checkedAt: Date.now(), checkedBy: user!.uid,
      checkedLat: gps.lat, checkedLng: gps.lng, accuracy: gps.accuracy,
    });
    setBusy(false);
  }

  return (
    <div className={`card stop ${stop.status}`}>
      <div className="row">
        <strong className="grow">{index}. {customer.name}</strong>
        <span className={`badge ${stop.status}`}>{label[stop.status]}</span>
      </div>
      <div>{customer.address}</div>
      {customer.notes && <div className="muted">{customer.notes}</div>}
      <div className="row" style={{ margin: '8px 0' }}>
        <a href={navigateUrl(customer.address, customer.lat, customer.lng)} target="_blank" rel="noreferrer"><button className="ghost small" type="button">Navigate</button></a>
        <button className="ghost small" disabled={busy || photos.length >= 3} onClick={() => fileRef.current?.click()}>Take photo ({photos.length}/3)</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
      </div>
      {photos.length > 0 && (
        <div className="thumbs">{photos.map((p) => <img key={p.id} src={dataUrl(p.jpegBase64)} alt="Curb" />)}</div>
      )}
      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button disabled={busy} onClick={() => setStatus('collected')}>Collected</button>
        <button disabled={busy} className="gray" onClick={() => setStatus('nothing_out')}>Nothing out</button>
        <button disabled={busy} className="warn" onClick={() => setStatus('skipped')}>Skip</button>
      </div>
      {stop.checkedAt && <p className="muted">Marked {new Date(stop.checkedAt).toLocaleTimeString()}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

const label: Record<StopStatus, string> = { pending: 'To do', collected: 'Collected', nothing_out: 'Nothing out', skipped: 'Skipped' };
