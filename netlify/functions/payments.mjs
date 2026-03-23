import { getStore } from '@netlify/blobs';

function auth(req) {
  const t = req.headers.get('x-auth-token');
  const pw = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  return t === Buffer.from(pw).toString('base64');
}

export default async (req) => {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const leadsStore = getStore({ name: 'leads', consistency: 'strong' });
  let leads = [];
  try { leads = (await leadsStore.get('leads', { type: 'json' })) || []; } catch {}

  // Only include leads with a payment plan
  const withPlans = leads.filter(l => l.payment_plan);
  const now = Date.now();
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(startOfMonth); endOfMonth.setMonth(endOfMonth.getMonth() + 1);

  let totalCollected = 0;
  let totalOutstanding = 0;
  let overdueCount = 0;
  let dueThisMonth = 0;

  const url = new URL(req.url);
  const filter = url.searchParams.get('filter'); // all | overdue | due_this_month | advance_waiting | completed

  const paymentLeads = withPlans.map(lead => {
    const plan = lead.payment_plan;
    const advance = plan.advance_amount || 0;
    const advanceCollected = plan.advance_status === 'received' ? advance : 0;
    const advanceOutstanding = plan.advance_status !== 'received' ? advance : 0;

    let installmentsCollected = 0;
    let installmentsOutstanding = 0;
    let overdueInst = 0;
    let dueThisMonthInst = 0;
    let paidCount = 0;

    for (const inst of (plan.installments || [])) {
      if (inst.paid) {
        installmentsCollected += inst.amount || 0;
        paidCount++;
      } else {
        installmentsOutstanding += inst.amount || 0;
        const dueDate = inst.due_date ? new Date(inst.due_date).getTime() : null;
        if (dueDate) {
          if (dueDate < now) overdueInst++;
          if (dueDate >= startOfMonth.getTime() && dueDate < endOfMonth.getTime()) dueThisMonthInst++;
        }
      }
    }

    const collected = advanceCollected + installmentsCollected;
    const outstanding = advanceOutstanding + installmentsOutstanding;
    const isCompleted = outstanding === 0 && lead.kanban_stage === 'completed';

    totalCollected += collected;
    totalOutstanding += outstanding;
    overdueCount += overdueInst;
    dueThisMonth += dueThisMonthInst;
    if (plan.advance_status !== 'received') overdueCount += 0; // advance overdue handled separately

    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      kanban_stage: lead.kanban_stage,
      payment_plan: plan,
      collected,
      outstanding,
      overdue_installments: overdueInst,
      due_this_month: dueThisMonthInst,
      paid_installment_count: paidCount,
      total_installments: (plan.installments || []).length,
      is_completed: isCompleted,
    };
  });

  // Apply filter
  let filtered = paymentLeads;
  if (filter === 'overdue') filtered = paymentLeads.filter(l => l.overdue_installments > 0);
  else if (filter === 'due_this_month') filtered = paymentLeads.filter(l => l.due_this_month > 0);
  else if (filter === 'advance_waiting') filtered = paymentLeads.filter(l => l.payment_plan?.advance_status === 'waiting');
  else if (filter === 'completed') filtered = paymentLeads.filter(l => l.is_completed);

  // Sort: overdue first, then by outstanding amount desc
  filtered.sort((a, b) => b.overdue_installments - a.overdue_installments || b.outstanding - a.outstanding);

  return Response.json({
    ok: true,
    summary: {
      total_collected: totalCollected,
      total_outstanding: totalOutstanding,
      overdue_count: overdueCount,
      due_this_month: dueThisMonth,
    },
    leads: filtered,
  });
};
export const config = { path: '/api/payments' };
