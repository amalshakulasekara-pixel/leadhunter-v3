import { getStore } from '@netlify/blobs';

export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const store = getStore({ name: 'gen-jobs', consistency: 'strong' });
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return Response.json({ error: 'No jobId' }, { status: 400 });

  if (req.method === 'POST') {
    await store.set(`stop_${jobId}`, '1');
    return Response.json({ ok: true });
  }

  try {
    const job = await store.get(jobId, { type: 'json' });
    if (!job) return Response.json({ status: 'pending' });
    if (['done', 'error', 'stopped'].includes(job.status)) {
      setTimeout(() => store.delete(jobId).catch(() => {}), 10000);
    }
    return Response.json(job);
  } catch {
    return Response.json({ status: 'pending' });
  }
};
export const config = { path: '/api/gen-status' };
