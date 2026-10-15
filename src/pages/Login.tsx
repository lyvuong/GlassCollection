import { useState } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, sendPasswordResetEmail,
} from 'firebase/auth';
import { getAuthInstance } from '../lib/firebase';
import { useAuth } from '../auth';
import InstallHelp from '../components/InstallHelp';

export default function Login() {
  const { user, refresh, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg('');
    try { await fn(); } catch (e) { setMsg(e instanceof Error ? e.message.replace('Firebase: ', '') : 'Something went wrong'); }
    setBusy(false);
  }

  // iOS installed PWAs often block the Google popup; fall back to a full-page redirect.
  async function googleSignIn() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(getAuthInstance(), provider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') {
        await signInWithRedirect(getAuthInstance(), provider);
      } else throw e;
    }
  }

  if (user && !user.emailVerified) {
    return (
      <div className="page narrow">
        <h1>Verify your email</h1>
        <p>We sent a verification link to <b>{user.email}</b>. Open it, then come back and continue.</p>
        <button onClick={() => run(async () => { await user.reload(); refresh(); location.reload(); })}>I verified, continue</button>{' '}
        <button className="ghost" onClick={() => run(() => sendEmailVerification(user))}>Resend email</button>{' '}
        <button className="ghost" onClick={signOut}>Sign out</button>
        {msg && <p className="error">{msg}</p>}
      </div>
    );
  }

  const auth = getAuthInstance;
  return (
    <div className="page narrow">
      <img className="logo" src="/icon.svg" alt="" width="88" height="88" />
      <h1 style={{ textAlign: 'center' }}>Glass Collection</h1>
      <button disabled={busy} onClick={() => run(googleSignIn)}>Continue with Google</button>
      <p className="muted">or use email and password</p>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
      {mode === 'in' ? (
        <>
          <button disabled={busy} onClick={() => run(() => signInWithEmailAndPassword(auth(), email, password))}>Sign in</button>{' '}
          <button className="ghost" onClick={() => setMode('up')}>Create account</button>{' '}
          <button className="ghost" disabled={!email} onClick={() => run(async () => { await sendPasswordResetEmail(auth(), email); setMsg('Password reset email sent.'); })}>Forgot password</button>
        </>
      ) : (
        <>
          <button disabled={busy} onClick={() => run(async () => {
            const c = await createUserWithEmailAndPassword(auth(), email, password);
            await sendEmailVerification(c.user);
          })}>Create account</button>{' '}
          <button className="ghost" onClick={() => setMode('in')}>Back to sign in</button>
        </>
      )}
      {msg && <p className="error">{msg}</p>}
      <InstallHelp />
    </div>
  );
}
