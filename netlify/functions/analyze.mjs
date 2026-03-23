export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { website, business_name, business_type } = await req.json();

  if (!website) {
    return Response.json({
      status: 'no_website', score: 10, priority: 10,
      issues: ['No website found'],
      call_points: ['No website — offer to build from scratch', 'Customers can\'t find them online', 'Show them a demo during the call'],
    });
  }

  let html = '';
  let broken = false;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(website, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadHunter/1.0)' } });
    if (!r.ok) broken = true;
    else { html = (await r.text()).slice(0, 20000); }
  } catch { broken = true; }

  if (broken) {
    return Response.json({
      status: 'broken', score: 9, priority: 9,
      issues: ['Website is down or unreachable'],
      call_points: ['Website is broken — customers are getting errors', 'Every day it\'s down = lost revenue', 'Offer emergency rebuild'],
    });
  }

  // Rule-based checks
  const h = html.toLowerCase();
  const checks = {
    mobile: h.includes('viewport') && h.includes('width=device-width'),
    whatsapp: h.includes('wa.me') || h.includes('whatsapp'),
    booking: /book|reserv|appointment|schedul|order\s*now/i.test(html),
    ssl: website.startsWith('https'),
    contact_form: /<form/i.test(html),
    gallery: (html.match(/<img/gi) || []).length >= 5,
    social: /facebook|instagram|twitter|tiktok/i.test(html),
    reviews: /review|testimonial|rating/i.test(html),
    map: /maps\.google|google.*map|embed.*map/i.test(html),
    price: /price|rate|cost|lkr|rs\./i.test(html),
    modern_css: /css.*grid|css.*flex|@media/i.test(html),
    fast_load: html.length < 100000,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.min(10, Math.max(1, Math.round((passed / 12) * 8) + 1));

  const issues = [];
  const call_points = [];
  if (!checks.mobile) { issues.push('Not mobile-friendly'); call_points.push('Website broken on phones — 85% of Sri Lanka browses on mobile'); }
  if (!checks.whatsapp) { issues.push('No WhatsApp button'); call_points.push('No WhatsApp — local customers expect instant messaging'); }
  if (!checks.booking) { issues.push('No online booking'); call_points.push('No booking system — losing customers who want to book instantly'); }
  if (!checks.ssl) { issues.push('No SSL (not HTTPS)'); call_points.push('Website not secure — Google warns visitors away'); }
  if (!checks.gallery) { issues.push('No photo gallery'); call_points.push('No photos — customers can\'t see what they\'re buying'); }
  if (!checks.reviews) { issues.push('No reviews/testimonials'); call_points.push('No reviews visible — builds zero trust'); }
  if (!checks.map) { issues.push('No Google Maps embed'); call_points.push('Hard to find location — no embedded map'); }
  if (!checks.social) { issues.push('No social media links'); call_points.push('No social links — missing a major traffic channel'); }

  let status = 'good';
  if (score <= 4) status = 'basic';
  else if (score <= 6) status = 'needs_work';

  return Response.json({ status, score, priority: status === 'basic' ? 7 : status === 'needs_work' ? 5 : 2, issues, call_points, checks });
};
export const config = { path: '/api/analyze' };
