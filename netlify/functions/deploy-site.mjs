export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { html, subdomain, business_name } = await req.json();
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) return Response.json({ ok: false, error: 'No Netlify API token configured' });
  if (!html) return Response.json({ ok: false, error: 'No HTML provided' });

  const siteName = (subdomain || business_name || 'demo')
    .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    + '-' + Date.now().toString(36);

  try {
    // Create site
    const createRes = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: siteName })
    });
    const site = await createRes.json();
    if (!site.id) return Response.json({ ok: false, error: site.message || 'Could not create Netlify site' });

    // Deploy via Files API (most reliable)
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { '/index.html': html } })
    });
    const deploy = await deployRes.json();
    if (!deploy.id) return Response.json({ ok: false, error: deploy.message || 'Deploy failed' });

    const siteUrl = site.ssl_url || site.url || `https://${siteName}.netlify.app`;
    return Response.json({ ok: true, url: siteUrl, site_id: site.id, deploy_id: deploy.id, name: siteName });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
};
export const config = { path: '/api/deploy-site' };
