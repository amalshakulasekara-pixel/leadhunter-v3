import { getStore } from '@netlify/blobs';

export default async (req) => {
  const { jobId, query, authToken } = await req.json();
  const store = getStore({ name: 'search-jobs', consistency: 'strong' });

  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (authToken !== Buffer.from(correct).toString('base64')) {
    await store.setJSON(jobId, { status: 'error', error: 'Unauthorized' });
    return;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    await store.setJSON(jobId, { status: 'error', error: 'Google Maps API key not configured' });
    return;
  }

  await store.setJSON(jobId, { status: 'running', results: [], page: 0, total: 0 });

  let allResults = [];
  let pageToken = null;
  let page = 0;
  const MAX_PAGES = 10; // up to 200 results

  try {
    do {
      // Check stop flag
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

      const res = await fetch(url);
      const data = await res.json();

      if (data.status === 'REQUEST_DENIED') {
        await store.setJSON(jobId, { status: 'error', error: `Google Maps API error: ${data.status}`, hint: data.error_message || 'Enable Places API and ensure billing is active in Google Cloud Console' });
        return;
      }
      if (data.status === 'OVER_QUERY_LIMIT') {
        // Wait 5s and retry once before failing
        await new Promise(r => setTimeout(r, 5000));
        const retryRes = await fetch(url);
        const retryData = await retryRes.json();
        if (retryData.status === 'OVER_QUERY_LIMIT') {
          await store.setJSON(jobId, { status: 'error', error: 'Google Maps quota exceeded', hint: 'Try again later or check your Google Cloud billing quota' });
          return;
        }
        // Continue with retry result — fall through
        Object.assign(data, retryData);
      }
      if (data.status === 'ZERO_RESULTS') break;
      if (!data.results || data.status === 'INVALID_REQUEST') break;

      // Get details for each place (phone, website)
      const detailed = await Promise.all(data.results.map(async (place) => {
        try {
          const dRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,rating,user_ratings_total,photos,opening_hours,types,url&key=${apiKey}`
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

      // Store incremental results so frontend can show them as they arrive
      await store.setJSON(jobId, { status: page >= MAX_PAGES || !data.next_page_token ? 'done' : 'running', results: allResults, page, total: allResults.length });

      pageToken = data.next_page_token || null;
      if (pageToken) await new Promise(r => setTimeout(r, 2500)); // Google requires delay
    } while (pageToken && page < MAX_PAGES);

    await store.setJSON(jobId, { status: 'done', results: allResults, page, total: allResults.length });
  } catch (e) {
    await store.setJSON(jobId, { status: 'error', error: e.message, results: allResults });
  }
};
export const config = { path: '/api/search-bg' };
