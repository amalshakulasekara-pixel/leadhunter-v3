export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { url, business_name, place_id, model } = await req.json();

  let html = '';
  let scraped = { name: business_name, description: '', services: [], phone: '', address: '', hours: '', prices: [], social: {}, tone: 'professional', unique_selling_points: [], brand_colors: [] };

  if (url) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.ok) html = (await r.text()).slice(0, 18000);
    } catch {}
  }

  // Extract brand colors from CSS/inline styles
  if (html) {
    const colorMatches = html.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || [];
    const colorFreq = {};
    colorMatches.forEach(c => { colorFreq[c] = (colorFreq[c] || 0) + 1; });
    scraped.brand_colors = Object.entries(colorFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  }

  if (html) {
    const useModel = model || process.env.AI_MODEL || 'gpt-4o-mini';
    const prompt = `Extract business info from this website HTML. Return ONLY valid JSON with this structure:
{"name":"","description":"","services":[],"phone":"","address":"","hours":"","prices":[],"social":{"facebook":"","instagram":""},"tone":"professional","unique_selling_points":[],"keywords":[]}

HTML:
${html.slice(0, 12000)}`;

    try {
      let text = '';
      if (useModel.startsWith('gpt')) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: useModel, messages: [{ role: 'user', content: prompt }], max_tokens: 1000, response_format: { type: 'json_object' } })
        });
        const d = await r.json();
        text = d.choices?.[0]?.message?.content || '';
      } else {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: useModel, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
        });
        const d = await r.json();
        text = d.content?.[0]?.text || '';
      }
      const match = text.match(/\{[\s\S]*\}/);
      if (match) scraped = { ...scraped, ...JSON.parse(match[0]), brand_colors: scraped.brand_colors };
    } catch {}
  }

  // Get Google Maps photos and reviews
  if (place_id && process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const dr = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=photos,reviews,opening_hours&key=${process.env.GOOGLE_MAPS_API_KEY}`);
      const dd = await dr.json();
      if (dd.result?.photos) {
        scraped.google_photos = dd.result.photos.slice(0, 10).map(p =>
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photoreference=${p.photo_reference}&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );
      }
      if (dd.result?.reviews) {
        scraped.google_reviews = dd.result.reviews.slice(0, 5).map(r => ({ author: r.author_name, rating: r.rating, text: r.text.slice(0, 200), time: r.relative_time_description }));
      }
      if (dd.result?.opening_hours?.weekday_text) {
        scraped.hours = dd.result.opening_hours.weekday_text.join(', ');
      }
    } catch {}
  }

  return Response.json({ ok: true, scraped });
};
export const config = { path: '/api/scrape' };
