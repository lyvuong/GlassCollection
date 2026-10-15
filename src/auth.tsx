import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuthInstance, getDb } from './lib/firebase';
import { useDocument } from './lib/data';
import { DEFAULT_SETTINGS, type Member, type Role, type Settings } from './lib/types';

interface AuthState {
  loading: boolean;
  user: User | null;
  member: Member | null;
  settings: Settings;
  denied: boolean;
  isStaff: boolean; // owner or editor
  isOwner: boolean;
  signOut: () => Promise<void>;
  refresh: () => void;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => useContext(Ctx)!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => onAuthStateChanged(getAuthInstance(), (u) => { setUser(u); if (!u) { setMember(null); setLoading(false); } }), []);

  useEffect(() => {
    if (!user) return;
    if (!user.emailVerified) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setDenied(false);
      const db = getDb();
      const email = (user.email ?? '').toLowerCase();
      const base = { email, displayName: user.displayName || email };
      try {
        let snap = await getDoc(doc(db, 'members', user.uid));
        if (!snap.exists()) {
          // Rules decide: owner email creates an owner; otherwise an invite must exist.
          try {
            await setDoc(doc(db, 'members', user.uid), { ...base, role: 'owner', routeIds: [] });
          } catch {
            const inv = await getDoc(doc(db, 'invites', email));
            if (inv.exists()) {
              const d = inv.data() as { role: Role; routeIds: string[] };
              await setDoc(doc(db, 'members', user.uid), { ...base, role: d.role, routeIds: d.routeIds ?? [] });
            }
          }
          snap = await getDoc(doc(db, 'members', user.uid));
        }
        if (cancelled) return;
        if (snap.exists()) {
          const d = snap.data() as Omit<Member, 'uid'>;
          setMember({ ...d, routeIds: d.routeIds ?? [], uid: user.uid });
        }
        else { setMember(null); setDenied(true); }
      } catch {
        if (!cancelled) { setMember(null); setDenied(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, tick]);

  const { data: s } = useDocument<Partial<Settings>>(member ? 'settings/app' : null);
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };

  const value: AuthState = {
    loading,
    user,
    member,
    settings,
    denied,
    isOwner: member?.role === 'owner',
    isStaff: member?.role === 'owner' || member?.role === 'editor',
    signOut: () => fbSignOut(getAuthInstance()),
    refresh: () => setTick((t) => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
