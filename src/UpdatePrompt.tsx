import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_EVERY_MS = 30 * 60 * 1000;

// Checks for a new deployment periodically and when the app returns to the foreground.
// Never reloads on its own, so a helper mid-pickup does not lose queued photos or check-offs.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="card" role="status" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 1000, display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>
      <span className="grow">A new version is available.</span>
      <button className="ghost small" onClick={() => setNeedRefresh(false)}>Later</button>
      <button className="small" onClick={() => updateServiceWorker(true)}>Update now</button>
    </div>
  );
}
