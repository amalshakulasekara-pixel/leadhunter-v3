export default async (req) => {
  const auth = req.headers.get('x-auth-token');
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (auth !== Buffer.from(correct).toString('base64')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { query, model } = await req.json();
  const useModel = model || process.env.AI_MODEL || 'gpt-4o-mini';

  const prompt = `Given the search query "${query}", generate 8 related business search terms for Sri Lanka.
Rules: vary the business category, vary the city (Colombo, Kandy, Galle, Negombo, Ella, Nuwara Eliya, Matara, Jaffna, Trincomalee), keep them realistic.
Return ONLY a JSON array of strings. Example: ["restaurants in kandy","cafes in colombo","hotels in ella"]`;

  try {
    let suggestions = [];
    if (useModel.startsWith('gpt')) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: useModel, messages: [{ role: 'user', content: prompt }], max_tokens: 200, response_format: { type: 'json_object' } })
      });
      const d = await r.json();
      let text = d.choices?.[0]?.message?.content || '[]';
      // Handle both array and object response
      try {
        const parsed = JSON.parse(text);
        suggestions = Array.isArray(parsed) ? parsed : Object.values(parsed)[0] || [];
      } catch { suggestions = []; }
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: useModel, max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
      });
      const d = await r.json();
      const text = d.content?.[0]?.text || '[]';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) suggestions = JSON.parse(match[0]);
    }
    return Response.json({ suggestions: suggestions.slice(0, 8) });
  } catch {
    return Response.json({ suggestions: [] });
  }
};
export const config = { path: '/api/related-search' };
