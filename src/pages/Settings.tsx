import { useState } from 'react';
import { useAuth } from '../auth';
import { remove, save, useCollection } from '../lib/data';
import { useMembers, useRoutes, useNeighborhoods } from '../hooks';
import type { Invite, PayRuleType, Role, Settings } from '../lib/types';

export default function SettingsPage() {
  const { settings, user } = useAuth();
  const { data: members } = useMembers();
  const { data: invites } = useCollection<Invite & { id: string }>('invites');
  const { data: routes } = useRoutes();
  const { data: areas } = useNeighborhoods();
  const [saved, setSaved] = useState('');
  const [inv, setInv] = useState<{ email: string; role: Role; routeIds: string[] }>({ email: '', role: 'helper', routeIds: [] });

  const upd = async (p: Partial<Settings>) => { await save('settings/app', p as Record<string, unknown>); setSaved('Saved'); setTimeout(() => setSaved(''), 1200); };
  const field = (k: keyof Settings, label: string, type = 'text') => (
    <label>{label}
      <input type={type} step={type === 'number' ? '0.01' : undefined} defaultValue={String(settings[k])}
        onBlur={(e) => upd({ [k]: type === 'number' ? Number(e.target.value) : e.target.value } as Partial<Settings>)} />
    </label>
  );
  const routeLabel = (id: string) => {
    const r = routes.find((x) => x.id === id);
    return r ? `${areas.find((a) => a.id === r.neighborhoodId)?.name} / ${r.name}` : id;
  };

  async function invite() {
    const email = inv.email.trim().toLowerCase();
    if (!email) return;
    await save(`invites/${email}`, { role: inv.role, routeIds: inv.role === 'helper' ? inv.routeIds : [], invitedBy: user?.uid ?? '' }, false);
    setInv({ email: '', role: 'helper', routeIds: [] });
  }

  return (
    <>
      <h1>Settings {saved && <span className="muted">{saved}</span>}</h1>
      <div className="card grid2">
        {field('businessName', 'Business name')}
        {field('defaultFee', 'Default monthly fee', 'number')}
        {field('currency', 'Currency code (USD)')}
        {field('contactEmail', 'Contact email (shown on notices)')}
        {field('reportingThreshold', 'Helper reporting threshold (e.g. 600)', 'number')}
        {field('mileageRate', 'Mileage rate per mile', 'number')}
        {field('photoRetentionDays', 'Keep photos for (days)', 'number')}
      </div>
      <div className="card">
        {field('paymentInstructions', 'Payment instructions (shown on statements)')}
        {field('statementFooter', 'Statement footer')}
        {field('emailSubject', 'Pickup email subject ({{date}}, {{name}})')}
        {field('emailIntro', 'Pickup email intro ({{name}}, {{date}})')}
        <label>Expense categories (comma separated)
          <input defaultValue={settings.expenseCategories.join(', ')} onBlur={(e) => upd({ expenseCategories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </label>
      </div>

      <h2>Team</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Routes</th><th>Pay rule</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid}>
                <td>{m.displayName}<div className="muted">{m.email}</div></td>
                <td>
                  <select value={m.role} disabled={m.uid === user?.uid} onChange={(e) => save(`members/${m.uid}`, { role: e.target.value })}>
                    <option value="owner">owner</option><option value="editor">editor</option><option value="helper">helper</option>
                  </select>
                </td>
                <td>
                  {m.role === 'helper' ? (
                    routes.map((r) => (
                      <label key={r.id} style={{ margin: 0 }}>
                        <input type="checkbox" checked={m.routeIds?.includes(r.id)} onChange={(e) => {
                          const s = new Set(m.routeIds ?? []); e.target.checked ? s.add(r.id) : s.delete(r.id);
                          save(`members/${m.uid}`, { routeIds: [...s] });
                        }} />{routeLabel(r.id)}
                      </label>
                    ))
                  ) : <span className="muted">all</span>}
                </td>
                <td>
                  <div className="row">
                    <select value={m.payRule?.type ?? ''} onChange={(e) => save(`members/${m.uid}`, { payRule: e.target.value ? { type: e.target.value as PayRuleType, rate: m.payRule?.rate ?? 0 } : null })}>
                      <option value="">none</option><option value="perDay">per pickup day</option><option value="perStop">per stop</option><option value="hourly">hourly</option>
                    </select>
                    {m.payRule && <input type="number" step="0.01" style={{ width: 90 }} defaultValue={m.payRule.rate} onBlur={(e) => save(`members/${m.uid}`, { payRule: { type: m.payRule!.type, rate: Number(e.target.value) } })} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Invite someone</h3>
      <div className="card">
        <div className="grid2">
          <label>Email<input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></label>
          <label>Role
            <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}>
              <option value="helper">helper (assigned routes only)</option><option value="editor">editor (everything except team/settings)</option>
            </select>
          </label>
        </div>
        {inv.role === 'helper' && (
          <div>{routes.map((r) => (
            <label key={r.id}><input type="checkbox" checked={inv.routeIds.includes(r.id)} onChange={(e) => {
              const s = new Set(inv.routeIds); e.target.checked ? s.add(r.id) : s.delete(r.id); setInv({ ...inv, routeIds: [...s] });
            }} />{routeLabel(r.id)}</label>
          ))}</div>
        )}
        <button onClick={invite}>Send invite</button>
        <p className="muted">Tell them to open the app and sign in with that email address. They are added automatically after verifying it.</p>
        {invites.map((i) => (
          <div className="row" key={i.id}>
            <span className="grow">{i.id} ({i.role})</span>
            <button className="ghost small" onClick={() => remove(`invites/${i.id}`)}>Cancel invite</button>
          </div>
        ))}
      </div>
    </>
  );
}
