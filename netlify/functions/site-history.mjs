import { getStore } from '@netlify/blobs';

function auth(req) {
  const t = req.headers.get('x-auth-token');
  const pw = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  return t === Buffer.from(pw).toString('base64');
}

export default async (req) => {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const store = getStore({ name: 'site-history', consistency: 'strong' });

  const getAll = async () => { try { return (await store.get('history', { type: 'json' })) || []; } catch { return []; } };

  if (req.method === 'GET') {
    return Response.json({ history: await getAll() });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    let history = await getAll();

    if (body.action === 'add') {
      const entry = {
        id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lead_id: body.lead_id,
        lead_name: body.lead_name,
        business_type: body.business_type || '',
        page: body.page || 'homepage',
        url: body.url || null,
        subdomain: body.subdomain || null,
        model: body.model || 'gpt-4o-mini',
        quality: body.quality || 'standard',
        sections: body.sections || {},
        html: body.html || '',
        created_at: Date.now(),
      };
      history.unshift(entry);
      history = history.slice(0, 100); // keep last 100
      await store.setJSON('history', history);
      return Response.json({ ok: true, entry });
    }

    if (body.action === 'delete') {
      history = history.filter(h => h.id !== body.id);
      await store.setJSON('history', history);
      return Response.json({ ok: true });
    }

    if (body.action === 'update_url') {
      const idx = history.findIndex(h => h.id === body.id);
      if (idx !== -1) { history[idx].url = body.url; await store.setJSON('history', history); }
      return Response.json({ ok: true });
    }
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
};
export const config = { path: '/api/site-history' };
