import { getStore } from '@netlify/blobs';

export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const store = getStore({ name: 'gen-drafts', consistency: 'strong' });

  // GET — load draft for a lead
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const leadId = url.searchParams.get('lead_id');
    if (!leadId) return Response.json({ error: 'No lead_id' }, { status: 400 });
    try {
      const draft = await store.get(`draft_${leadId}`, { type: 'json' });
      return Response.json({ ok: true, draft: draft || null });
    } catch {
      return Response.json({ ok: true, draft: null });
    }
  }

  // POST — save or delete draft
  if (req.method === 'POST') {
    const body = await req.json();
    const { action, lead_id, draft } = body;

    if (!lead_id) return Response.json({ error: 'No lead_id' }, { status: 400 });

    if (action === 'save') {
      await store.setJSON(`draft_${lead_id}`, {
        ...draft,
        last_updated: Date.now()
      });
      return Response.json({ ok: true });
    }

    if (action === 'delete') {
      try { await store.delete(`draft_${lead_id}`); } catch {}
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};
export const config = { path: '/api/gen-draft' };
