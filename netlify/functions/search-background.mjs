import { getStore } from '@netlify/blobs';

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export default async (req) => {
  let jobId, query, authToken;
  try {
    ({ jobId, query, authToken } = await req.json());
  } catch {
    return; // malformed request — nothing we can do
  }

  const store = getStore({ name: 'search-jobs', consistency: 'strong' });

  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (authToken !== Buffer.from(correct).toString('base64')) {
    await store.setJSON(jobId, { status: 'error', error: 'Unauthorized' }).catch(() => {});
    return;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    await store.setJSON(jobId, { status: 'error', error: 'Google Maps API key not configured' }).catch(() => {});
    return;
  }

  await store.setJSON(jobId, { status: 'running', results: [], page: 0, total: 0 }).catch(() => {});

  let allResults = [];
  let pageToken = null;
  let page = 0;
  const MAX_PAGES = 10;

  try {
    do {
      try {
        const stopFlag = await store.get(`stop_${jobId}`);
        if (stopFlag) {
          await store.setJSON(jobId, { status: 'stopped', results: allResults, page, total: allResults.length });
          store.delete(`stop_${jobId}`).catch(() => {});
          return;
        }
      } catch {}

      const url = pageToken
        ? `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${encodeURIComponent(pageToken)}&key=${apiKey}`
        : `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;

      const res = await fetchWithTimeout(url, 15000);
      const data = await res.json();

      if (data.status === 'REQUEST_DENIED') {
        await store.setJSON(jobId, { status: 'error', error: `Google Maps API error: REQUEST_DENIED`, hint: data.error_message || 'Enable "Places API (old)" in Google Cloud Console → APIs & Services, then ensure billing is active' });
        return;
      }
      if (data.status === 'OVER_QUERY_LIMIT') {
        await new Promise(r => setTimeout(r, 5000));
        const retryRes = await fetchWithTimeout(url, 15000);
        const retryData = await retryRes.json();
        if (retryData.status === 'OVER_QUERY_LIMIT') {
          await store.setJSON(jobId, { status: 'error', error: 'Google Maps quota exceeded', hint: 'Try again later or check your Google Cloud billing quota' });
          return;
        }
        Object.assign(data, retryData);
      }
      if (data.status === 'ZERO_RESULTS') break;
      if (!data.results || data.status === 'INVALID_REQUEST') break;

      // Get details for each place (phone, website) with timeouts
      const detailed = await Promise.all(data.results.map(async (place) => {
        try {
          const dRes = await fetchWithTimeout(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,rating,user_ratings_total,photos,opening_hours,types,url&key=${apiKey}`,
            10000
          );
          const dd = await dRes.json();
          const d = dd.result || {};
          const photoRef = d.photos?.[0]?.photo_reference;
          return {
            place_id: place.place_id,
            name: d.name || place.name,
            phone: d.formatted_phone_number || null,
            website: d.website || null,
            address: d.formatted_address || place.formatted_address || '',
            rating: d.rating || place.rating || null,
            reviews: d.user_ratings_total || place.user_ratings_total || 0,
            types: d.types || place.types || [],
            maps_url: d.url || null,
            photo: photoRef ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoRef}&key=${apiKey}` : null,
            opening_hours: d.opening_hours?.weekday_text || null,
          };
        } catch { return null; }
      }));

      const valid = detailed.filter(Boolean);
      allResults = [...allResults, ...valid];
      page++;

      await store.setJSON(jobId, { status: page >= MAX_PAGES || !data.next_page_token ? 'done' : 'running', results: allResults, page, total: allResults.length });

      pageToken = data.next_page_token || null;
      if (pageToken) await new Promise(r => setTimeout(r, 2500));
    } while (pageToken && page < MAX_PAGES);

    await store.setJSON(jobId, { status: 'done', results: allResults, page, total: allResults.length });
  } catch (e) {
    await store.setJSON(jobId, { status: 'error', error: e.message || 'Unknown error', results: allResults }).catch(() => {});
  }
};
export const config = { path: '/api/search-bg' };
