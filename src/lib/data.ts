import { useEffect, useState } from 'react';
import {
  collection, collectionGroup, doc, onSnapshot, query, setDoc, deleteDoc, updateDoc,
  type QueryConstraint, type DocumentData,
} from 'firebase/firestore';
import { getDb } from './firebase';

export function useCollection<T extends { id: string }>(
  path: string | null,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = [],
): { data: T[]; loading: boolean; error?: string } {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error?: string }>({ data: [], loading: !!path });
  useEffect(() => {
    if (!path) { setState({ data: [], loading: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    const q = query(collection(getDb(), path), ...constraints);
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T), loading: false }),
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state;
}

export function useGroup<T extends { id: string }>(name: string, constraints: QueryConstraint[] = [], deps: unknown[] = []) {
  const [state, setState] = useState<{ data: (T & { _path: string })[]; loading: boolean }>({ data: [], loading: true });
  useEffect(() => {
    const q = query(collectionGroup(getDb(), name), ...constraints);
    return onSnapshot(q, (snap) =>
      setState({ data: snap.docs.map((d) => ({ ...(d.data() as object), id: d.id, _path: d.ref.path }) as T & { _path: string }), loading: false }),
      () => setState({ data: [], loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ...deps]);
  return state;
}

export function useDocument<T>(path: string | null): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: !!path });
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false }); return; }
    return onSnapshot(
      doc(getDb(), path),
      (d) => setState({ data: d.exists() ? (d.data() as T) : null, loading: false }),
      () => setState({ data: null, loading: false }),
    );
  }, [path]);
  return state;
}

/** Strip undefined (Firestore rejects it) and the client-only id field. */
function clean(data: Record<string, unknown>): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined && k !== 'id' && k !== '_path') out[k] = v;
  return out;
}

export async function save(path: string, data: Record<string, unknown>, merge = true) {
  await setDoc(doc(getDb(), path), clean(data), { merge });
}
export async function patch(path: string, data: Record<string, unknown>) {
  await updateDoc(doc(getDb(), path), clean(data));
}
export async function remove(path: string) {
  await deleteDoc(doc(getDb(), path));
}
export function newId(path: string): string {
  return doc(collection(getDb(), path)).id;
}
