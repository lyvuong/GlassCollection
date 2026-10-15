import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Customers from './pages/Customers';
import Neighborhoods from './pages/Neighborhoods';
import Plan from './pages/Plan';
import Collect from './pages/Collect';
import History from './pages/History';
import Payments from './pages/Payments';
import Money from './pages/Money';
import Notices from './pages/Notices';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';

export default function App() {
  const { loading, user, member, denied, isStaff, isOwner, signOut, settings, refresh } = useAuth();

  if (loading) return <div className="page narrow"><p>Loading…</p></div>;
  if (!user || !user.emailVerified) return <Login />;
  if (!member) {
    return (
      <div className="page narrow">
        <h1>{settings.businessName}</h1>
        <p>{denied ? 'This account has not been invited yet. Ask the owner to invite' : 'Setting up'} <b>{user.email}</b>.</p>
        <button onClick={refresh}>Try again</button> <button className="ghost" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  const links: [string, string][] = isStaff
    ? [['/', 'Customers'], ['/plan', 'Plan'], ['/collect', 'Collect'], ['/history', 'History'], ['/payments', 'Payments'], ['/money', 'Money'], ['/notices', 'Notices'], ['/reports', 'Reports']]
    : [['/collect', 'Collect']];
  if (isStaff) links.push(['/areas', 'Areas']);
  if (isOwner) links.push(['/settings', 'Settings']);

  return (
    <>
      <header className="topbar">
        <strong>{settings.businessName}</strong>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
        </nav>
        <button className="ghost" onClick={signOut}>Sign out</button>
      </header>
      <main className="page">
        <Routes>
          {isStaff ? (
            <>
              <Route path="/" element={<Customers />} />
              <Route path="/areas" element={<Neighborhoods />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/history" element={<History />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/money" element={<Money />} />
              <Route path="/notices" element={<Notices />} />
              <Route path="/reports" element={<Reports />} />
              {isOwner && <Route path="/settings" element={<SettingsPage />} />}
            </>
          ) : (
            <Route path="/" element={<Navigate to="/collect" replace />} />
          )}
          <Route path="/collect" element={<Collect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
