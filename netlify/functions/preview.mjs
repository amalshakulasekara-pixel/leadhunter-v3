import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Not found', { status: 404 });

  if (req.method === 'POST') {
    // Auth required to save previews
    const auth = req.headers.get('x-auth-token');
    const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
    if (auth !== Buffer.from(correct).toString('base64')) return new Response('Unauthorized', { status: 401 });
    const { html } = await req.json();
    const store = getStore({ name: 'previews', consistency: 'strong' });
    await store.set(id, html);
    return Response.json({ ok: true });
  }

  // Public GET - no auth needed
  try {
    const store = getStore({ name: 'previews', consistency: 'strong' });
    const html = await store.get(id);
    if (!html) return new Response('Preview not found or expired', { status: 404 });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return new Response('Error loading preview', { status: 500 });
  }
};
export const config = { path: '/api/preview' };
