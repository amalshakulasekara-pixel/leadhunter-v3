import { getStore } from '@netlify/blobs';

function auth(req) {
  const t = req.headers.get('x-auth-token');
  const pw = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  return t === Buffer.from(pw).toString('base64');
}

const store = () => getStore({ name: 'campaigns', consistency: 'strong' });

async function getIndex(s) {
  try { return (await s.get('_index', { type: 'json' })) || []; } catch { return []; }
}

async function saveIndex(s, index) {
  await s.setJSON('_index', index);
}

export default async (req) => {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const s = store();

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const id = url.searchParams.get('id');

    // List all campaigns
    if (!action || action === 'list') {
      const index = await getIndex(s);
      return Response.json({ ok: true, campaigns: index });
    }

    // Get full campaign (with results)
    if (action === 'get' && id) {
      try {
        const campaign = await s.get(id, { type: 'json' });
        if (!campaign) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true, campaign });
      } catch {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    }
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { action, id } = body;

    // Create a new campaign
    if (action === 'create') {
      const campaignId = `campaign_${Date.now()}`;
      const campaign = {
        id: campaignId,
        keyword: body.keyword || '',
        created_at: Date.now(),
        status: 'active',
        total: body.results?.length || 0,
        added: 0,
        skipped: 0,
        saved_for_later: 0,
        results: (body.results || []).map(r => ({ ...r, review_status: 'pending' })),
      };
      await s.setJSON(campaignId, campaign);

      // Update index
      const index = await getIndex(s);
      index.unshift({
        id: campaignId,
        keyword: campaign.keyword,
        created_at: campaign.created_at,
        status: 'active',
        total: campaign.total,
        added: 0, skipped: 0, saved_for_later: 0,
      });
      // Cap index at 100 campaigns
      if (index.length > 100) index.splice(100);
      await saveIndex(s, index);

      return Response.json({ ok: true, campaign_id: campaignId });
    }

    // Add more results to an existing campaign
    if (action === 'add_results' && id) {
      let campaign;
      try { campaign = await s.get(id, { type: 'json' }); } catch {}
      if (!campaign) return Response.json({ error: 'Not found' }, { status: 404 });

      const newResults = (body.results || []).map(r => ({ ...r, review_status: 'pending' }));
      campaign.results = [...campaign.results, ...newResults];
      campaign.total = campaign.results.length;
      await s.setJSON(id, campaign);

      const index = await getIndex(s);
      const idx = index.findIndex(c => c.id === id);
      if (idx !== -1) index[idx].total = campaign.total;
      await saveIndex(s, index);

      return Response.json({ ok: true });
    }

    // Update a single result's status (added / skipped / saved_for_later)
    if (action === 'update_result' && id) {
      const VALID = ['added', 'skipped', 'saved_for_later', 'pending'];
      if (!VALID.includes(body.review_status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

      let campaign;
      try { campaign = await s.get(id, { type: 'json' }); } catch {}
      if (!campaign) return Response.json({ error: 'Not found' }, { status: 404 });

      const result = campaign.results?.find(r => r.place_id === body.place_id || r.result_index === body.result_index);
      if (!result) return Response.json({ error: 'Result not found' }, { status: 404 });

      const oldStatus = result.review_status;
      if (oldStatus !== 'pending' && oldStatus !== body.review_status) {
        // Decrement old counter
        if (campaign[oldStatus] !== undefined) campaign[oldStatus] = Math.max(0, campaign[oldStatus] - 1);
      }
      result.review_status = body.review_status;
      if (body.review_status !== 'pending') campaign[body.review_status] = (campaign[body.review_status] || 0) + (oldStatus === 'pending' ? 1 : 0);

      // Check if all reviewed
      const pending = campaign.results.filter(r => r.review_status === 'pending').length;
      if (pending === 0) campaign.status = 'completed';

      await s.setJSON(id, campaign);

      // Update index counts
      const index = await getIndex(s);
      const idx = index.findIndex(c => c.id === id);
      if (idx !== -1) {
        index[idx].added = campaign.added || 0;
        index[idx].skipped = campaign.skipped || 0;
        index[idx].saved_for_later = campaign.saved_for_later || 0;
        index[idx].status = campaign.status;
      }
      await saveIndex(s, index);

      return Response.json({ ok: true, pending });
    }

    // Delete a campaign
    if (action === 'delete' && id) {
      try { await s.delete(id); } catch {}
      const index = (await getIndex(s)).filter(c => c.id !== id);
      await saveIndex(s, index);
      return Response.json({ ok: true });
    }

    // Mark campaign completed manually
    if (action === 'complete' && id) {
      let campaign;
      try { campaign = await s.get(id, { type: 'json' }); } catch {}
      if (!campaign) return Response.json({ error: 'Not found' }, { status: 404 });
      campaign.status = 'completed';
      await s.setJSON(id, campaign);
      const index = await getIndex(s);
      const idx = index.findIndex(c => c.id === id);
      if (idx !== -1) index[idx].status = 'completed';
      await saveIndex(s, index);
      return Response.json({ ok: true });
    }
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
};
export const config = { path: '/api/campaigns' };
