import { getStore } from '@netlify/blobs';

export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const store = getStore({ name: 'meta', consistency: 'strong' });

  if (req.method === 'GET') {
    let meta = {};
    try { meta = (await store.get('meta', { type: 'json' })) || {}; } catch {}
    return Response.json(meta);
  }

  if (req.method === 'POST') {
    const body = await req.json();
    let meta = {};
    try { meta = (await store.get('meta', { type: 'json' })) || {}; } catch {}

    if (body.action === 'add_search') {
      meta.search_history = meta.search_history || [];
      meta.search_history = meta.search_history.filter(s => s.query !== body.query);
      meta.search_history.unshift({ query: body.query, timestamp: Date.now(), total: body.total || 0 });
      meta.search_history = meta.search_history.slice(0, 15);
    }
    if (body.action === 'set_settings') {
      meta.ai_model = body.ai_model || meta.ai_model || 'gpt-4o-mini';
      meta.gen_quality = body.gen_quality || meta.gen_quality || 'standard';
    }
    if (body.action === 'clear_search_history') {
      meta.search_history = [];
    }

    if (body.action === 'set_wa_templates') {
      if (!Array.isArray(body.templates)) return Response.json({ error: 'templates must be array' }, { status: 400 });
      meta.wa_templates = body.templates;
    }

    if (body.action === 'set_custom_prompt') {
      const settingsStore = getStore({ name: 'settings', consistency: 'strong' });
      await settingsStore.setJSON('custom_prompt', { prompt: body.prompt || '', updated_at: Date.now() });
      return Response.json({ ok: true });
    }

    if (body.action === 'get_custom_prompt') {
      const settingsStore = getStore({ name: 'settings', consistency: 'strong' });
      let cp = null;
      try { cp = await settingsStore.get('custom_prompt', { type: 'json' }); } catch {}
      return Response.json({ ok: true, prompt: cp?.prompt || null });
    }

    await store.setJSON('meta', meta);
    return Response.json({ ok: true, meta });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
};
export const config = { path: '/api/meta' };
