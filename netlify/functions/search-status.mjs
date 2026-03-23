import { getStore } from '@netlify/blobs';

export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const store = getStore({ name: 'search-jobs', consistency: 'strong' });
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return Response.json({ error: 'No jobId' }, { status: 400 });

  if (req.method === 'POST') {
    // Stop the search
    await store.set(`stop_${jobId}`, '1');
    return Response.json({ ok: true });
  }

  try {
    const job = await store.get(jobId, { type: 'json' });
    if (!job) return Response.json({ status: 'pending', results: [], total: 0 });
    // Clean up done/stopped/error jobs after serving
    if (job.status === 'done' || job.status === 'stopped' || job.status === 'error') {
      setTimeout(() => store.delete(jobId).catch(() => {}), 5000);
    }
    return Response.json(job);
  } catch {
    return Response.json({ status: 'pending', results: [], total: 0 });
  }
};
export const config = { path: '/api/search-status' };
