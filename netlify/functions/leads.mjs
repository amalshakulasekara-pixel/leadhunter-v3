import { getStore } from '@netlify/blobs';

function auth(req) {
  const t = req.headers.get('x-auth-token');
  const pw = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  return t === Buffer.from(pw).toString('base64');
}
function store() { return getStore({ name: 'leads', consistency: 'strong' }); }
async function getLeads(s) { try { return (await s.get('leads', { type: 'json' })) || []; } catch { return []; } }

export default async (req) => {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const s = store();
  const method = req.method;

  if (method === 'GET') {
    const leads = await getLeads(s);
    const now = Date.now();
    return Response.json({ leads: leads.map(l => {
      const ageDays = Math.floor((now - (l.added_at || now)) / 86400000);
      return { ...l, age_days: ageDays, age_status: ageDays >= 14 ? 'red' : ageDays >= 7 ? 'yellow' : 'fresh' };
    })});
  }

  if (method === 'POST') {
    const body = await req.json();
    const { action } = body;
    let leads = await getLeads(s);

    if (action === 'add') {
      const dup = leads.find(l =>
        (body.lead.place_id && l.place_id === body.lead.place_id) ||
        (body.lead.phone && body.lead.phone !== '' && l.phone === body.lead.phone)
      );
      if (dup) return Response.json({ ok: false, error: 'Duplicate', existing_id: dup.id });
      const lead = {
        ...body.lead,
        id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'not_called', kanban_stage: 'not_called',
        priority_score: body.lead.analysis?.priority || 5,
        added_at: Date.now(), call_history: [], notes: '',
        deal_value: 0, follow_up_date: null, demo_url: null, demo_views: 0, generated_sites: [],
        payment_plan: null,
        manual: body.lead.manual || false,
      };
      leads.push(lead);
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, lead });
    }

    if (action === 'add_bulk') {
      let added = 0, skipped = 0;
      for (const nl of (body.leads || [])) {
        const dup = leads.find(l => (nl.place_id && l.place_id === nl.place_id) || (nl.phone && nl.phone !== '' && l.phone === nl.phone));
        if (dup) { skipped++; continue; }
        leads.push({ ...nl, id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, status: 'not_called', kanban_stage: 'not_called', priority_score: nl.analysis?.priority || 5, added_at: Date.now(), call_history: [], notes: '', deal_value: 0, follow_up_date: null, demo_url: null, demo_views: 0, generated_sites: [], manual: false });
        added++;
      }
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, added, skipped });
    }

    if (action === 'update') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx === -1) return Response.json({ ok: false, error: 'Not found' });
      leads[idx] = { ...leads[idx], ...body.updates, id: body.id };
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, lead: leads[idx] });
    }

    if (action === 'log_call') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx === -1) return Response.json({ ok: false });
      leads[idx].call_history = leads[idx].call_history || [];
      leads[idx].call_history.unshift({ timestamp: Date.now(), note: body.note || '', outcome: body.outcome || null });
      if (body.outcome) { leads[idx].status = body.outcome; leads[idx].kanban_stage = body.outcome; }
      if (body.follow_up_date) leads[idx].follow_up_date = body.follow_up_date;
      if (body.deal_value) leads[idx].deal_value = Number(body.deal_value);
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, lead: leads[idx] });
    }

    if (action === 'delete') {
      leads = leads.filter(l => l.id !== body.id);
      await s.setJSON('leads', leads);
      return Response.json({ ok: true });
    }

    if (action === 'delete_bulk') {
      leads = leads.filter(l => !(body.ids || []).includes(l.id));
      await s.setJSON('leads', leads);
      return Response.json({ ok: true });
    }

    if (action === 'add_site') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx === -1) return Response.json({ ok: false });
      leads[idx].generated_sites = leads[idx].generated_sites || [];
      leads[idx].generated_sites.push(body.site);
      if (body.site.url) leads[idx].demo_url = body.site.url;
      await s.setJSON('leads', leads);
      return Response.json({ ok: true });
    }

    if (action === 'update_payment') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx === -1) return Response.json({ ok: false, error: 'Not found' });
      const plan = body.payment_plan;
      if (!plan) return Response.json({ ok: false, error: 'No payment_plan provided' });
      leads[idx].payment_plan = { ...plan, updated_at: Date.now() };
      // Auto-sync deal_value from payment plan total
      if (plan.total_value) leads[idx].deal_value = Number(plan.total_value);
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, lead: leads[idx] });
    }

    if (action === 'mark_advance_paid') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx === -1) return Response.json({ ok: false, error: 'Not found' });
      if (!leads[idx].payment_plan) return Response.json({ ok: false, error: 'No payment plan' });
      leads[idx].payment_plan.advance_status = 'received';
      leads[idx].payment_plan.advance_received_date = Date.now();
      leads[idx].payment_plan.updated_at = Date.now();
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, lead: leads[idx] });
    }

    if (action === 'mark_installment_paid') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx === -1) return Response.json({ ok: false, error: 'Not found' });
      if (!leads[idx].payment_plan) return Response.json({ ok: false, error: 'No payment plan' });
      const inst = leads[idx].payment_plan.installments?.find(i => i.id === body.installment_id);
      if (!inst) return Response.json({ ok: false, error: 'Installment not found' });
      inst.paid = true;
      inst.paid_date = Date.now();
      if (body.note) inst.note = body.note;
      leads[idx].payment_plan.updated_at = Date.now();
      await s.setJSON('leads', leads);
      return Response.json({ ok: true, lead: leads[idx] });
    }

    if (action === 'inc_views') {
      const idx = leads.findIndex(l => l.id === body.id);
      if (idx !== -1) { leads[idx].demo_views = (leads[idx].demo_views || 0) + 1; await s.setJSON('leads', leads); }
      return Response.json({ ok: true });
    }

    if (action === 'stats') {
      const total = leads.length;
      const byStage = (s) => leads.filter(l => (l.kanban_stage || l.status) === s).length;
      const now = new Date();
      return Response.json({
        total,
        not_called: byStage('not_called'), called: byStage('called'),
        interested: byStage('interested'), callback: byStage('callback'),
        advance_waiting: byStage('advance_waiting'), advance_received: byStage('advance_received'),
        completed: byStage('completed'), not_interested: byStage('not_interested'),
        // legacy 'won' compat
        won: byStage('completed') + byStage('advance_received'),
        revenue: leads.filter(l => l.kanban_stage === 'completed').reduce((a, l) => a + (l.deal_value || 0), 0),
        pipeline: leads.filter(l => ['interested','callback','advance_waiting','advance_received'].includes(l.kanban_stage||l.status)).reduce((a, l) => a + (l.deal_value || 0), 0),
        follow_ups_today: leads.filter(l => l.follow_up_date && new Date(l.follow_up_date).toDateString() === now.toDateString()).length,
        overdue: leads.filter(l => l.follow_up_date && new Date(l.follow_up_date) < now && !['completed','not_interested'].includes(l.kanban_stage||l.status)).length,
      });
    }
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
};
export const config = { path: '/api/leads' };
