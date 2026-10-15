// Cloudflare Pages Function: POST /api/send-email
// Verifies the Firebase ID token, checks the caller is an owner/editor and that the recipient is the
// stored email of the named subscriber, enforces a daily cap, then sends through Resend.
// Secrets (Pages -> Settings -> Environment variables, encrypted): EMAIL_API_KEY, EMAIL_FROM,
// EMAIL_REPLY_TO, FIREBASE_PROJECT_ID, optional DAILY_SEND_CAP.

interface Env {
  EMAIL_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO?: string;
  FIREBASE_PROJECT_ID: string;
  DAILY_SEND_CAP?: string;
}

interface Body {
  customerId: string;
  kind: 'pickupNotice' | 'statement';
  collectionId?: string;
  month?: string;
  subject: string;
  html: string;
  text: string;
  inlineImages?: { id: string; base64: string }[];
  attachments?: { filename: string; base64: string; contentType: string }[];
}

const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyIdToken(token: string, projectId: string): Promise<{ uid: string; email?: string } | null> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  if (header.alg !== 'RS256') return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || payload.exp < now || payload.iat > now + 60) return null;
  const jwks = (await (await fetch(JWK_URL, { cf: { cacheTtl: 3600 } } as RequestInit)).json()) as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  return ok ? { uid: payload.sub, email: payload.email } : null;
}

const fsBase = (pid: string) => `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;

async function fsGet(pid: string, path: string, token: string) {
  const r = await fetch(`${fsBase(pid)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return (await r.json()) as { fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> };
}

async function sentToday(pid: string, token: string, cap: number): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const r = await fetch(`${fsBase(pid)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'emails' }],
        where: {
          fieldFilter: { field: { fieldPath: 'sentAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(start.getTime()) } },
        },
        select: { fields: [{ fieldPath: '__name__' }] },
        limit: cap + 1,
      },
    }),
  });
  if (!r.ok) return cap; // fail closed
  const rows = (await r.json()) as { document?: unknown }[];
  return rows.filter((x) => x.document).length;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json(401, { error: 'Missing token' });
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM || !env.FIREBASE_PROJECT_ID) return json(500, { error: 'Email is not configured' });

  let user: { uid: string } | null = null;
  try {
    user = await verifyIdToken(token, env.FIREBASE_PROJECT_ID);
  } catch {
    user = null;
  }
  if (!user) return json(401, { error: 'Invalid token' });

  const pid = env.FIREBASE_PROJECT_ID;
  const member = await fsGet(pid, `members/${user.uid}`, token);
  const role = member?.fields?.role?.stringValue;
  if (role !== 'owner' && role !== 'editor') return json(403, { error: 'Not allowed' });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { error: 'Bad JSON' });
  }
  if (!body.customerId || !body.subject || !body.html) return json(400, { error: 'Missing fields' });
  if ((body.attachments?.length ?? 0) > 3 || (body.inlineImages?.length ?? 0) > 5) return json(400, { error: 'Too many attachments' });

  const customer = await fsGet(pid, `customers/${body.customerId}`, token);
  const to = customer?.fields?.email?.stringValue?.trim();
  const optIn = customer?.fields?.emailOptIn?.booleanValue;
  if (!to) return json(400, { error: 'Subscriber has no email address' });
  if (optIn === false) return json(400, { error: 'Subscriber has email turned off' });

  const cap = Number(env.DAILY_SEND_CAP || 100);
  if ((await sentToday(pid, token, cap)) >= cap) return json(429, { error: 'Daily send limit reached' });

  const attachments = [
    ...(body.inlineImages ?? []).map((i) => ({ filename: `${i.id}.jpg`, content: i.base64, content_id: i.id })),
    ...(body.attachments ?? []).map((a) => ({ filename: a.filename, content: a.base64 })),
  ];

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      reply_to: env.EMAIL_REPLY_TO || undefined,
      subject: body.subject,
      html: body.html,
      text: body.text,
      attachments: attachments.length ? attachments : undefined,
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    return json(502, { error: `Email provider error ${r.status}: ${detail.slice(0, 200)}` });
  }

  // Record the send (rules apply because the caller's token is used) so the daily cap and log work.
  await fetch(`${fsBase(pid)}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        customerId: { stringValue: body.customerId },
        kind: { stringValue: body.kind },
        collectionId: { stringValue: body.collectionId ?? '' },
        month: { stringValue: body.month ?? '' },
        to: { stringValue: to },
        subject: { stringValue: body.subject },
        status: { stringValue: 'sent' },
        sentAt: { integerValue: String(Date.now()) },
        sentBy: { stringValue: user.uid },
      },
    }),
  }).catch(() => undefined);

  return json(200, { ok: true });
};
