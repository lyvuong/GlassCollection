import { collection as fsCollection, getDocs } from 'firebase/firestore';
import { getDb } from './firebase';
import type { Collection, PhotoDoc, Stop } from './types';
import type { PickupLine } from './pdf';

/** Per-subscriber pickup lines for all collections dated in `month` (YYYY-MM). */
export async function loadMonthPickups(month: string, collections: Collection[]): Promise<Map<string, PickupLine[]>> {
  const out = new Map<string, PickupLine[]>();
  for (const c of collections.filter((x) => x.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))) {
    const snap = await getDocs(fsCollection(getDb(), `collections/${c.id}/stops`));
    for (const d of snap.docs) {
      const s = d.data() as Stop;
      if (s.status === 'pending') continue;
      const list = out.get(d.id) ?? [];
      list.push({ date: c.date, status: s.status, note: s.note ?? '' });
      out.set(d.id, list);
    }
  }
  return out;
}

export async function loadStopPhotos(collectionId: string, customerId: string): Promise<PhotoDoc[]> {
  const snap = await getDocs(fsCollection(getDb(), `collections/${collectionId}/stops/${customerId}/photos`));
  return snap.docs.map((d) => ({ ...(d.data() as PhotoDoc), id: d.id })).sort((a, b) => a.takenAt - b.takenAt);
}

export function pdfToBase64(doc: { output: (t: 'datauristring') => string }): string {
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf('base64,') + 7);
}
