export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const { password, type } = await req.json();
  const crmPw = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  const builderPw = process.env.BUILDER_PASSWORD || 'Generate7376';
  const adminPw = process.env.ADMIN_PASSWORD || 'Admin2026';
  const target = type === 'builder' ? builderPw : type === 'admin' ? adminPw : crmPw;
  if (password === target) {
    return Response.json({ ok: true, token: Buffer.from(target).toString('base64'), type: type || 'crm' });
  }
  return Response.json({ ok: false, error: 'Wrong password' }, { status: 401 });
};
export const config = { path: '/api/auth' };
