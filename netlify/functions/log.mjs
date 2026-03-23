import { getStore } from '@netlify/blobs';

function adminAuth(req) {
  const t = req.headers.get('x-auth-token');
  const adminPw = process.env.ADMIN_PASSWORD || 'Admin2026';
  return t === Buffer.from(adminPw).toString('base64');
}

function crmAuth(req) {
  const t = req.headers.get('x-auth-token');
  const crmPw = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  const builderPw = process.env.BUILDER_PASSWORD || 'Generate7376';
  const adminPw = process.env.ADMIN_PASSWORD || 'Admin2026';
  const token = Buffer.from(t || '', 'base64').toString();
  return [crmPw, builderPw, adminPw].includes(token) || adminAuth(req);
}

const store = () => getStore({ name: 'activity-log', consistency: 'strong' });

async function getLogs(s) {
  try { return (await s.get('log', { type: 'json' })) || []; } catch { return []; }
}

export default async (req) => {
  const s = store();

  // GET — read log entries (admin only)
  if (req.method === 'GET') {
    if (!adminAuth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const from = url.searchParams.get('from') ? Number(url.searchParams.get('from')) : null;
    const to = url.searchParams.get('to') ? Number(url.searchParams.get('to')) : null;
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = 50;

    let logs = await getLogs(s);
    if (type) logs = logs.filter(e => e.event_type === type);
    if (from) logs = logs.filter(e => e.timestamp >= from);
    if (to) logs = logs.filter(e => e.timestamp <= to);
    const total = logs.length;
    const entries = logs.slice((page - 1) * limit, page * limit);
    return Response.json({ ok: true, entries, total, page, pages: Math.ceil(total / limit) });
  }

  // POST — write a log event (any authenticated caller)
  if (req.method === 'POST') {
    if (!crmAuth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (!body.event_type) return Response.json({ error: 'event_type required' }, { status: 400 });

    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      event_type: body.event_type,
      details: body.details || '',
      meta: body.meta || null,
      timestamp: Date.now(),
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-nf-client-connection-ip') || null,
    };

    const logs = await getLogs(s);
    logs.unshift(entry);
    // Cap at 1000 entries
    if (logs.length > 1000) logs.splice(1000);
    await s.setJSON('log', logs);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};
export const config = { path: '/api/log' };
