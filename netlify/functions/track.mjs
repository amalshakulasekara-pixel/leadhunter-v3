import { getStore } from '@netlify/blobs';
export default async (req) => {
  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) return Response.json({ ok: false });
  try {
    const store = getStore({ name: 'leads', consistency: 'strong' });
    let leads = (await store.get('leads', { type: 'json' })) || [];
    const idx = leads.findIndex(l => l.id === lead_id);
    if (idx !== -1) { leads[idx].demo_views = (leads[idx].demo_views || 0) + 1; await store.setJSON('leads', leads); }
    return Response.json({ ok: true });
  } catch { return Response.json({ ok: false }); }
};
export const config = { path: '/api/track' };
