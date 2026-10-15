import { useEffect, useState } from 'react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../auth';
import { useCollection } from '../lib/data';
import { balanceAsOf, monthKey, money } from '../lib/billing';
import { fillTemplate, renderPickupHtml, sendEmail } from '../lib/mailer';
import { buildStatementPdf, outcomeLabel } from '../lib/pdf';
import { loadMonthPickups, loadStopPhotos, pdfToBase64 } from '../lib/pickups';
import { useCustomers } from '../hooks';
import type { Collection, Customer, EmailLog, PhotoDoc, Payment, Stop } from '../lib/types';

interface Row {
  customer: Customer;
  stop: Stop;
  photos: PhotoDoc[];
  selected: boolean;
  note: string;
  status?: 'sent' | 'failed' | 'sending';
  error?: string;
}

export default function Notices() {
  const { settings } = useAuth();
  const { data: collections } = useCollection<Collection>('collections');
  const { data: customers } = useCustomers();
  const { data: payments } = useCollection<Payment>('payments');
  const { data: logs } = useCollection<EmailLog>('emails', [orderBy('sentAt', 'desc')]);
  const [tab, setTab] = useState<'pickup' | 'statement'>('pickup');
  const [cid, setCid] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const sorted = [...collections].sort((a, b) => b.date.localeCompare(a.date));
  const collection = collections.find((c) => c.id === cid) ?? sorted[0];

  useEffect(() => {
    if (tab !== 'pickup' || !collection) return;
    let cancelled = false;
    (async () => {
      const { collection: fsc, getDocs } = await import('firebase/firestore');
      const { getDb } = await import('../lib/firebase');
      const snap = await getDocs(fsc(getDb(), `collections/${collection.id}/stops`));
      const out: Row[] = [];
      for (const d of snap.docs) {
        const stop = { ...(d.data() as Stop), id: d.id };
        const customer = customers.find((c) => c.id === d.id);
        if (!customer || stop.status === 'pending') continue;
        out.push({ customer, stop, photos: await loadStopPhotos(collection.id, d.id), selected: !!customer.email && customer.emailOptIn && customer.emailFrequency === 'pickup', note: stop.note ?? '' });
      }
      if (!cancelled) setRows(out.sort((a, b) => a.customer.name.localeCompare(b.customer.name)));
    })();
    return () => { cancelled = true; };
  }, [tab, collection?.id, customers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasSent = (customerId: string) => logs.some((l) => l.customerId === customerId && l.collectionId === collection?.id && l.kind === 'pickupNotice' && l.status === 'sent');

  async function sendPickup(testTo?: boolean) {
    if (!collection) return;
    setBusy(true);
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      if (!r.selected) continue;
      if (!testTo && wasSent(r.customer.id) && !confirm(`${r.customer.name} already got this notice. Send again?`)) continue;
      next[i] = { ...r, status: 'sending' };
      setRows([...next]);
      const vars = { name: r.customer.name, date: collection.date };
      const photoIds = r.photos.map((p) => `photo${p.id}`);
      const { html, text } = renderPickupHtml({
        intro: fillTemplate(settings.emailIntro, vars),
        outcome: outcomeLabel(r.stop.status),
        time: r.stop.checkedAt ? new Date(r.stop.checkedAt).toLocaleString() : collection.date,
        note: r.note,
        photoIds,
        footer: `${settings.statementFooter}${settings.contactEmail ? ' Questions? ' + settings.contactEmail : ''}`,
        business: settings.businessName,
      });
      const res = await sendEmail({
        customerId: r.customer.id, kind: 'pickupNotice', collectionId: collection.id,
        subject: fillTemplate(settings.emailSubject, vars), html, text,
        inlineImages: r.photos.map((p) => ({ id: `photo${p.id}`, base64: p.jpegBase64 })),
      });
      next[i] = { ...r, status: res.ok ? 'sent' : 'failed', error: res.error };
      setRows([...next]);
    }
    setBusy(false);
  }

  async function sendStatements(selected: Customer[]) {
    setBusy(true);
    setMsg('Preparing statements…');
    const pickups = await loadMonthPickups(month, collections);
    let ok = 0;
    const failed: string[] = [];
    for (const c of selected) {
      const doc = buildStatementPdf({ settings, customer: c, month, payments, pickups: pickups.get(c.id) ?? [] });
      const bal = balanceAsOf(c, payments, month);
      const vars = { name: c.name, date: month, balance: money(bal, settings.currency) };
      const text = `${settings.businessName}\nStatement for ${month}\nBalance due: ${money(bal, settings.currency)}\n${settings.paymentInstructions}\n`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>${settings.businessName}</h2><p>Hi ${c.name}, your statement for ${month} is attached.</p><p><strong>Balance due: ${vars.balance}</strong></p><p>${settings.paymentInstructions}</p><p style="color:#666">${settings.statementFooter}</p></div>`;
      const res = await sendEmail({
        customerId: c.id, kind: 'statement', month, subject: `${settings.businessName} statement for ${month}`, html, text,
        attachments: [{ filename: `statement-${month}-${c.name.replace(/\W+/g, '_')}.pdf`, base64: pdfToBase64(doc), contentType: 'application/pdf' }],
      });
      res.ok ? ok++ : failed.push(`${c.name}: ${res.error}`);
    }
    setBusy(false);
    setMsg(`${ok} statement(s) sent.${failed.length ? ' Problems: ' + failed.join('; ') : ''}`);
  }

  const emailable = customers.filter((c) => c.email && c.emailOptIn);

  return (
    <>
      <h1>Send notices</h1>
      <div className="row">
        <button className={tab === 'pickup' ? '' : 'ghost'} onClick={() => setTab('pickup')}>Pickup notices</button>
        <button className={tab === 'statement' ? '' : 'ghost'} onClick={() => setTab('statement')}>Monthly statements</button>
      </div>
      <p className="muted">Emails go only to the address saved for each subscriber and include only their own photos.</p>

      {tab === 'pickup' && (
        <>
          <label>Pickup day
            <select value={collection?.id ?? ''} onChange={(e) => setCid(e.target.value)}>
              {sorted.map((c) => <option key={c.id} value={c.id}>{c.date} ({c.status})</option>)}
            </select>
          </label>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th /><th>Subscriber</th><th>Result</th><th>Photos</th><th>Note</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.customer.id}>
                    <td><input type="checkbox" disabled={!r.customer.email} checked={r.selected} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))} /></td>
                    <td>{r.customer.name}<div className="muted">{r.customer.email || 'no email'}</div></td>
                    <td><span className={`badge ${r.stop.status}`}>{outcomeLabel(r.stop.status)}</span></td>
                    <td><div className="thumbs">{r.photos.map((p) => <img key={p.id} style={{ height: 50 }} src={`data:image/jpeg;base64,${p.jpegBase64}`} alt="" />)}</div></td>
                    <td><input value={r.note} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} /></td>
                    <td>
                      {r.status && <span className={`badge ${r.status}`}>{r.status}</span>}
                      {!r.status && wasSent(r.customer.id) && <span className="badge sent">sent before</span>}
                      {r.error && <div className="error">{r.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted">No visited stops for this pickup day.</p>}
          </div>
          <button disabled={busy || !rows.some((r) => r.selected)} onClick={() => sendPickup()}>
            {busy ? 'Sending…' : `Send ${rows.filter((r) => r.selected).length} notice(s)`}
          </button>
        </>
      )}

      {tab === 'statement' && (
        <>
          <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} /></label>
          <p>{emailable.length} subscriber(s) have an email address and notices turned on.</p>
          <button disabled={busy || emailable.length === 0} onClick={() => confirm(`Email ${month} statements to ${emailable.length} subscribers?`) && sendStatements(emailable)}>
            {busy ? 'Sending…' : 'Email all statements'}
          </button>
        </>
      )}
      {msg && <p className="muted">{msg}</p>}

      <h2>Recent emails</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <tbody>
            {logs.slice(0, 30).map((l) => (
              <tr key={l.id}><td>{l.sentAt ? new Date(l.sentAt).toLocaleString() : ''}</td><td>{l.to}</td><td>{l.subject}</td><td><span className={`badge ${l.status}`}>{l.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

