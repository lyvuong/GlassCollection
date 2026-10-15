import { getAuthInstance } from './firebase';

export interface OutgoingEmail {
  customerId: string;
  kind: 'pickupNotice' | 'statement';
  collectionId?: string;
  month?: string;
  subject: string;
  html: string;
  text: string;
  /** Inline images referenced from html as cid:<id> */
  inlineImages?: { id: string; base64: string }[];
  attachments?: { filename: string; base64: string; contentType: string }[];
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderPickupHtml(opts: {
  intro: string; outcome: string; time: string; note: string; photoIds: string[]; footer: string; business: string;
}): { html: string; text: string } {
  const imgs = opts.photoIds.map((id) => `<p><img src="cid:${id}" alt="Curb photo" style="max-width:100%;border-radius:8px"></p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
<h2>${esc(opts.business)}</h2><p>${esc(opts.intro)}</p>
<p><strong>${esc(opts.outcome)}</strong>${opts.time ? ` &middot; ${esc(opts.time)}` : ''}</p>
${opts.note ? `<p>${esc(opts.note)}</p>` : ''}${imgs}<p style="color:#666">${esc(opts.footer)}</p></div>`;
  const text = `${opts.business}\n\n${opts.intro}\n${opts.outcome}${opts.time ? ' - ' + opts.time : ''}\n${opts.note}\n\n${opts.footer}`;
  return { html, text };
}

/** Sends through the Cloudflare Pages Function, which verifies the caller and the recipient. */
export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const user = getAuthInstance().currentUser;
  if (!user) return { ok: false, error: 'Not signed in' };
  const token = await user.getIdToken();
  try {
    const r = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(msg),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
