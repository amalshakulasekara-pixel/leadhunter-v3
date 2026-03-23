import { getStore } from '@netlify/blobs';

// Quality settings — token budgets per quality level
const QUALITY = {
  simple:   { max_tokens: 4096,  sections: ['hero', 'services', 'about', 'contact'] },
  standard: { max_tokens: 8192,  sections: ['hero', 'about', 'services', 'gallery', 'testimonials', 'contact'] },
  premium:  { max_tokens: 16000, sections: ['hero', 'about', 'services', 'gallery', 'testimonials', 'faq', 'contact'] },
};

// Actual model output token limits
const MODEL_MAX = {
  'gpt-4o-mini':              16384,
  'gpt-4o':                   16384,
  'claude-sonnet-4-6':        8192,
  'claude-haiku-4-5-20251001': 4096,
  'gemini-2.0-flash':         8192,
  'gemini-2.5-pro':           65536,
};

// ─── Section order by business type ────────────────────────────────────────
function getSectionOrder(business, quality) {
  const t = (business.types || []).join(' ').toLowerCase();
  const q = quality || 'standard';
  if (q === 'simple') return ['hero', 'services', 'about', 'contact'];
  const isRestaurant = t.includes('restaurant') || t.includes('food') || t.includes('cafe') || t.includes('bakery');
  const isHotel = t.includes('lodging') || t.includes('hotel') || t.includes('accommodation') || t.includes('guest');
  const isTour = t.includes('tour') || t.includes('travel') || t.includes('driver') || t.includes('transport');
  const isSalon = t.includes('salon') || t.includes('spa') || t.includes('beauty') || t.includes('hair');

  const base = q === 'premium' ? 8 : 6;
  if (isRestaurant) return ['hero', 'menu', 'about', 'gallery', 'testimonials', 'booking', 'contact'].slice(0, base);
  if (isHotel)      return ['hero', 'rooms', 'amenities', 'gallery', 'testimonials', 'booking', 'contact'].slice(0, base);
  if (isTour)       return ['hero', 'tours', 'why_us', 'gallery', 'testimonials', 'booking', 'contact'].slice(0, base);
  if (isSalon)      return ['hero', 'services', 'team', 'gallery', 'testimonials', 'booking', 'contact'].slice(0, base);
  return ['hero', 'about', 'services', 'gallery', 'testimonials', 'faq', 'contact'].slice(0, base);
}

// ─── Skeleton prompt ─────────────────────────────────────────────────────────
function buildSkeletonPrompt(business, scraped) {
  const btype = (business.types || []).join(', ').toLowerCase() || 'local business';
  const phone = (business.phone || '94700000000').replace(/[^0-9]/g, '');
  const colors = (scraped?.brand_colors || []).slice(0, 3).join(', ');
  const isRestaurant = btype.includes('restaurant') || btype.includes('food') || btype.includes('cafe');
  const isHotel = btype.includes('hotel') || btype.includes('lodging');
  const isTour = btype.includes('tour') || btype.includes('travel');
  const isSalon = btype.includes('salon') || btype.includes('spa') || btype.includes('beauty');

  const colorHint = colors
    ? `Use these extracted brand colors as starting point: ${colors}`
    : isRestaurant ? 'Warm amber/terracotta palette (--brand:#c17a3a, --accent:#e8a255)'
    : isHotel      ? 'Deep teal/stone/gold palette (--brand:#2d6a6a, --accent:#c9a84c)'
    : isTour       ? 'Forest green/earthy orange palette (--brand:#2d5a27, --accent:#e07b39)'
    : isSalon      ? 'Dusty rose/sage palette (--brand:#b06a6a, --accent:#7a9e7e)'
    : 'Professional dark navy/gold palette (--brand:#1a2e4a, --accent:#c9a84c)';

  const navLinks = isRestaurant ? 'Home, Menu, About, Gallery, Reservations, Contact'
    : isHotel   ? 'Home, Rooms, Amenities, Gallery, Contact'
    : isTour    ? 'Home, Tours, Gallery, About, Contact'
    : isSalon   ? 'Home, Services, Team, Gallery, Booking, Contact'
    : 'Home, About, Services, Gallery, Contact';

  return `You are a world-class frontend web designer. Generate the HTML STRUCTURE ONLY — no page section content — for a ${btype} website.

BUSINESS: ${business.name} | ${btype} | ${business.address || 'Sri Lanka'} | Phone: ${business.phone || ''}
COLOR DIRECTION: ${colorHint}

GENERATE EXACTLY THIS STRUCTURE:

1. <!DOCTYPE html> and <html lang="en">

2. <head> containing:
   - <title>${business.name} | ${btype.split(',')[0].trim()}</title>
   - Meta charset, viewport, description, Open Graph tags
   - Tailwind CDN: <script src="https://cdn.tailwindcss.com"></script>
   - Tailwind config with brand colors IMMEDIATELY after CDN:
     <script>tailwind.config={theme:{extend:{colors:{brand:'var(--brand)',accent:'var(--accent)'}}}}</script>
   - AOS CSS: <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet">
   - AOS JS: <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
   - Google Fonts: pick 2 fonts suited for ${btype}. NOT Roboto/Inter as heading font.
     Examples: Playfair Display+DM Sans (elegant), Space Grotesk+Inter (modern), Oswald+Open Sans (bold)
   - JSON-LD LocalBusiness schema with business name, address, phone, type
   - <style> block with ALL of these (no exceptions):
     :root {
       --brand: [hex]; --brand-dark: [hex]; --brand-light: [hex];
       --accent: [hex]; --accent-dark: [hex];
       --text: [hex]; --text-muted: [hex];
       --bg: [hex]; --surface: [hex]; --surface-raised: [hex];
       --border: [hex]; --radius: 10px; --radius-lg: 18px;
       --shadow-sm: 0 2px 4px rgba(0,0,0,.04),0 4px 12px rgba(0,0,0,.06);
       --shadow-md: 0 4px 8px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.1);
       --shadow-lg: 0 8px 16px rgba(0,0,0,.08),0 24px 48px rgba(0,0,0,.14);
       --font-heading: '[Heading Font Name]', serif;
       --font-body: '[Body Font Name]', sans-serif;
     }
     Base: body, *, *, box-sizing, font-family, background, color
     Typography: h1-h6 using --font-heading with tight letter-spacing, p/body using --font-body
     Buttons: .btn-primary (filled), .btn-secondary (outline), both with hover/focus/active states
     Card: .card class with border, border-radius, box-shadow, background
     Section: .section class (padding: 80px 0), .container (max-width 1200px, centered)
     Section headers: .section-title, .section-subtitle classes
     Badge: .badge class (small pill label)
     Nav: #main-nav — sticky, starts transparent, adds solid background on scroll
       Transition: background 0.3s, box-shadow 0.3s
     Mobile nav: hamburger button #nav-toggle, mobile menu #mobile-menu (hidden by default)
     Footer: footer styles
     Loading screen: #loader (fullscreen, centered, business name, fades out)
     Scrollbar: custom thin scrollbar in brand colors
     Back to top: #back-to-top (fixed bottom-right, hidden by default)
     WhatsApp float: #wa-float (fixed bottom-right, above back-to-top)

3. <body>:
   a. Loading screen: <div id="loader"><div class="loader-inner"><span>${business.name}</span></div></div>
   b. Sticky nav: #main-nav with logo text "${business.name}", nav links (${navLinks}), hamburger button
   c. <main id="main-content">
      <!-- SECTIONS_START -->
      <!-- SECTIONS_END -->
      </main>
   d. Footer: business name, address "${business.address || ''}", phone "${business.phone || ''}", copyright ${new Date().getFullYear()}, nav links, WhatsApp link wa.me/${phone}
   e. Back-to-top button: <button id="back-to-top" aria-label="Back to top">↑</button>
   f. WhatsApp float: <a id="wa-float" href="https://wa.me/${phone}" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp SVG icon</a>

4. <script> at end of body with:
   - AOS.init({duration:900, once:true, easing:'ease-out-cubic'})
   - Nav scroll: window.addEventListener('scroll', ...) → add/remove .nav-scrolled class on #main-nav
   - Hamburger: #nav-toggle click → toggle #mobile-menu visibility
   - Loader fadeout: window.addEventListener('load', () => setTimeout(() => loader.style.opacity='0', 800))
   - Back-to-top: show after 400px scroll, click → window.scrollTo({top:0,behavior:'smooth'})
   - Counter animation: window.startCounters = function() { ... } (animates elements with data-count attribute)
   - IntersectionObserver to trigger startCounters when counter elements enter viewport
   - Smooth scroll for anchor links

CRITICAL RULES:
- <main id="main-content"> must contain ONLY the two comment markers, nothing else
- Do NOT generate any section content (hero, services, about etc.)
- The CSS :root block must define ALL variables listed above — sections will reference them
- Return complete HTML from <!DOCTYPE html> to </html>
- No markdown fences, no explanation`;
}

// ─── Section prompt ───────────────────────────────────────────────────────────
function buildSectionPrompt(sectionName, business, scraped, cssVars, quality) {
  const btype = (business.types || []).join(', ').toLowerCase() || 'local business';
  const phone = (business.phone || '94700000000').replace(/[^0-9]/g, '');
  const photos = (scraped?.google_photos || []).slice(0, 8);
  const reviews = (scraped?.google_reviews || []).slice(0, 4);
  const qualityDesc = quality === 'premium'
    ? 'PREMIUM — maximum detail, multiple sub-components, rich micro-interactions, polished hover states'
    : quality === 'standard' ? 'STANDARD — good detail, smooth animations, clean layout'
    : 'SIMPLE — clean and functional, minimal animations';

  const imgSrc = (i) => photos[i] ? `"${photos[i]}"` : `"https://placehold.co/${i===0?'1200x600':'800x500'}/REPLACE_HEX/ffffff?text=${sectionName}"`;

  const sectionInstructions = {
    hero: `Full-screen hero section.
- Background: ${photos[0] ? `<img src="${photos[0]}" ...> with a gradient overlay div (position:absolute, inset:0, background: linear-gradient(135deg, rgba(var_brand_dark_rgb,0.75) 0%, rgba(0,0,0,0.5) 100%))` : 'layered radial gradients using --brand and --brand-dark, plus SVG grain texture filter at 3% opacity'}
- Centered content: small badge/label, large h1 (business name or powerful tagline), subtitle (1-2 lines), 2 CTA buttons (.btn-primary + .btn-secondary)
- Below content: stats row (3-4 stats with data-count for animation: e.g. years in business, happy clients, rating)
- AOS: data-aos="fade-up" with staggered delays on each text element`,

    about: `About / story section. Two-column layout (desktop), stacked (mobile).
- Left: eyebrow label, h2, 2-3 paragraphs about the business, 3 differentiator rows (icon + bold label + text), CTA button
- Right: image ${photos[1] ? `<img src="${photos[1]}">` : 'placehold.co/500x500 in brand colors'} with decorative offset border frame behind it
- Bottom: stats counters row (data-count attributes)`,

    services: `Services / offerings grid section.
- Services to feature: ${(scraped?.services || []).slice(0, 8).join(', ') || 'Service 1, Service 2, Service 3, Service 4'}
- Each service card: SVG icon (relevant to service), h3 name, p description (2 lines), hover effect (translateY(-6px) + shadow increase)
- 3-col grid on desktop, 2-col tablet, 1-col mobile
- Optional: pricing row at bottom of card if prices available: ${(scraped?.prices || []).slice(0, 3).join(', ')}`,

    menu: `Tabbed menu section for restaurant/cafe.
- Tabs: Starters, Mains, Desserts, Drinks (CSS tab switcher, JS click handler)
- Each tab: grid of menu item cards (name, description, price in Rs.)
- Prices from context: ${(scraped?.prices || []).slice(0, 8).join(', ') || 'write realistic Sri Lankan restaurant prices (Rs. 300–2500)'}
- Featured item highlighted with accent border
- Search/filter input above tabs (optional for premium)`,

    rooms: `Hotel rooms / accommodation section.
- Room type cards with hover flip effect (CSS perspective transform): image on front, room details+rate on back
- 3-4 room types: Standard, Deluxe, Suite, Family (or equivalent)
- Each: photo, name, amenities list (4-5 icons), rate per night in Rs., "Book Now" button
- Occupancy badges, availability indicators`,

    tours: `Tour packages section.
- Package cards: tour name, duration (X days/X hours), highlights list (4-5 items), starting price (Rs.), difficulty/type badge, "Inquire" button
- Services: ${(scraped?.services || []).slice(0, 5).join(', ') || 'Day Tours, Multi-Day Tours, Custom Packages'}
- Featured tour: larger hero card at top
- Filter buttons by tour type (optional for premium)`,

    gallery: `Photo gallery section.
- ${photos.length >= 4 ? `Use these real photos: ${photos.slice(0, 8).map(u=>`<img src="${u}">`).join(', ')}` : 'Use 6-8 placehold.co images in brand colors at 400x300'}
- Masonry grid layout (CSS columns: 3 on desktop, 2 on tablet, 1 on mobile)
- Hover: dark overlay with zoom/expand icon, scale(1.03)
- Lightbox on click: simple JS — create overlay with clicked image fullscreen
- Category filter tabs if premium (All, Interior, Food, Events etc.)`,

    testimonials: `Testimonials / reviews section.
- ${reviews.length > 0 ? `Real Google reviews: ${JSON.stringify(reviews)}` : 'Write 3-4 realistic positive reviews for a ' + btype}
- Card design: large opening quote mark, review text, 5-star rating (SVG stars), reviewer name + date, avatar placeholder
- Layout: 3-col grid desktop, 1-col mobile with horizontal scroll
- Accent background behind section or alternate bg`,

    faq: `FAQ accordion section.
- 6-8 relevant questions for a ${btype} business (pricing, booking process, what to expect, location, hours, cancellation, customization, etc.)
- CSS accordion: each item has question button + hidden answer panel
- Smooth height transition using max-height and overflow:hidden
- Active item: show answer, change icon (+→−), accent color on question`,

    why_us: `Why choose us / stats section.
- Stats counters (large numbers with data-count): ${reviews.length > 0 ? `${reviews.length * 50}+ happy clients` : '500+ happy clients'}, 5+ years experience, 4.8+ rating, 100% satisfaction
- 4 feature highlights: icon, bold title, 1-line description
- Strong CTA at bottom`,

    team: `Team members section.
- 3-4 team member cards: photo (placehold.co/300x300), name, role/specialty, years experience, 2-3 specialties as tags
- Hover: card lifts, social link icons appear
- Clean grid layout`,

    amenities: `Amenities / features section.
- 8-12 amenities relevant to ${btype}: WiFi, Parking, Air Conditioning, etc.
- Icon grid: SVG icon + label + brief description
- Alternating colored icons in brand palette
- Possibly 2-col layout: amenities grid on left, image on right`,

    booking: `Booking / inquiry form section.
- Netlify Form: <form name="contact" method="POST" data-netlify="true">
- Fields for ${btype.includes('restaurant') ? 'Name, Phone, Date, Time, Party Size, Special Requests'
  : btype.includes('hotel') ? 'Name, Email, Check-in, Check-out, Guests, Room Type, Message'
  : btype.includes('tour') ? 'Name, Phone, Email, Tour Interest, Preferred Date, Group Size, Message'
  : btype.includes('salon') ? 'Name, Phone, Service, Preferred Date, Preferred Stylist, Message'
  : 'Name, Phone, Email, Service, Preferred Date, Message'}
- Large WhatsApp CTA button beside form
- Clean two-column form layout on desktop`,

    contact: `Contact section.
- Two columns: info (left) + form (right)
- Left: address with map pin icon, phone with click-to-call, email, hours (${scraped?.hours || 'Mon-Sat: 9am-6pm'}), large WhatsApp button (wa.me/${phone})
- Right: Netlify Form (<form name="contact" method="POST" data-netlify="true">) with name, phone, email, message, submit button
- Below form: Google Maps embed iframe for "${business.address || business.name + ', Sri Lanka'}"`,
  };

  const instruction = sectionInstructions[sectionName]
    || `Generate a professional ${sectionName} section for a ${btype}. Make it visually rich and appropriate.`;

  return `You are generating ONLY the "${sectionName}" section HTML for the website of "${business.name}" (${btype}, ${business.address || 'Sri Lanka'}).

QUALITY: ${qualityDesc}

CSS VARIABLES DEFINED IN THE SITE (use these — do not redefine):
${cssVars || '--brand: #c17a3a; --accent: #e8a255; --text: #1a1a2e; --bg: #f8f5f0; --surface: #ffffff; --border: rgba(0,0,0,.08); --radius: 10px; --shadow-md: 0 4px 8px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.1);'}

AVAILABLE SHARED CLASSES: .btn-primary, .btn-secondary, .btn-outline, .section, .container, .section-title, .section-subtitle, .card, .badge

SECTION TO BUILD:
${instruction}

RULES:
- Return ONLY the section HTML — no <html>, <head>, <body>, or other wrapper tags
- You MAY include a <style> block with ONLY section-specific CSS (animations, layouts unique to this section)
- Use CSS variables for ALL colors — never hardcode hex values for colors already in :root
- Use AOS attributes for animations: data-aos="fade-up", data-aos-delay="100/200/300" etc.
- Images: use provided real URLs where specified, otherwise https://placehold.co/WIDTHxHEIGHT/HEXHEX/ffffff
- All prices in Sri Lankan Rupees (Rs.)
- Wrap output EXACTLY like this (section name lowercase):

<!-- SECTION:${sectionName} START -->
<section id="${sectionName}" class="section">
  ...
</section>
<!-- SECTION:${sectionName} END -->

No markdown fences. No explanation. Start with <!-- SECTION:${sectionName} START --> and end with <!-- SECTION:${sectionName} END -->.`;
}

// ─── Full-site prompt (fallback / simple quality) ────────────────────────────
function buildFullPrompt(business, scraped, opts) {
  const { manual_instructions, manual_prompt, patch_instruction, existing_html, page_type, quality, section_to_patch, custom_prompt } = opts;
  const btype = (business.types || []).join(', ').toLowerCase() || 'local business';
  const phone = (business.phone || '94700000000').replace(/[^0-9]/g, '');
  const q = quality || 'standard';

  if (manual_prompt) return manual_prompt;
  if (custom_prompt) return custom_prompt
    .replace('{name}', business.name)
    .replace('{type}', btype)
    .replace('{address}', business.address || 'Sri Lanka')
    .replace('{phone}', business.phone || '')
    .replace('{description}', scraped?.description || '')
    .replace('{services}', (scraped?.services || []).join(', '))
    .replace('{hours}', scraped?.hours || '')
    .replace('{prices}', (scraped?.prices || []).join(', '))
    .replace('{tone}', scraped?.tone || 'professional')
    .replace('{usps}', (scraped?.unique_selling_points || []).join(', '))
    .replace('{brand_colors}', (scraped?.brand_colors || []).join(', '))
    .replace('{google_photos}', JSON.stringify((scraped?.google_photos || []).slice(0, 6)))
    .replace('{google_reviews}', JSON.stringify((scraped?.google_reviews || []).slice(0, 3)))
    .replace('{QUALITY_LEVEL}', q.toUpperCase())
    .replace('{style_refs}', opts.style_refs || 'None provided')
    .replace('{special_instructions}', manual_instructions ? `\nSPECIAL INSTRUCTIONS: ${manual_instructions}` : '');

  if (patch_instruction && existing_html && section_to_patch) {
    return `You are editing a specific section of an existing website.

SECTION TO EDIT: ${section_to_patch}
INSTRUCTION: ${patch_instruction}

Return ONLY the new HTML for this section wrapped in:
<!-- SECTION:${section_to_patch} START -->
[your new section HTML here]
<!-- SECTION:${section_to_patch} END -->

Do not return anything else. No DOCTYPE, no <html>, no explanation.

Current section HTML:
${existing_html}`;
  }

  const sectionCount = q === 'simple' ? '4' : q === 'standard' ? '6' : '8';
  const sections = getSectionOrder(business, q);

  return `You are a world-class frontend web designer. Create a complete, production-ready website for "${business.name}" — a ${btype} in Sri Lanka.

QUALITY: ${q.toUpperCase()} — ${sectionCount} sections

BUSINESS CONTEXT:
Name: ${business.name}
Type: ${btype}
Address: ${business.address || 'Sri Lanka'}
Phone: ${business.phone || '+94 XX XXX XXXX'}
Rating: ${business.rating || 'N/A'} (${business.reviews || 0} reviews)
Description: ${scraped?.description || ''}
Services: ${(scraped?.services || []).slice(0, 8).join(', ')}
Hours: ${scraped?.hours || ''}
Prices: ${(scraped?.prices || []).slice(0, 5).join(', ')}
Tone: ${scraped?.tone || 'professional'}
USPs: ${(scraped?.unique_selling_points || []).join(', ')}
Brand Colors: ${(scraped?.brand_colors || []).join(', ')}
Google Photos (use as real images): ${JSON.stringify((scraped?.google_photos || []).slice(0, 6))}
Google Reviews: ${JSON.stringify((scraped?.google_reviews || []).slice(0, 3))}
${manual_instructions ? `\nSPECIAL INSTRUCTIONS: ${manual_instructions}` : ''}

DESIGN RULES:
- Never use generic blue/indigo as primary color. Derive palette from business type and brand colors.
- Tailwind CSS via CDN + custom brand color config
- Typography: pair a display/serif heading font with a clean sans-serif body font (NOT Roboto/Inter for headings)
- Layered box-shadows (2-3 layers at low opacity), not flat shadows
- AOS.js for scroll animations (CDN)
- Sticky nav: transparent → solid on scroll
- WhatsApp floating button (wa.me/${phone})
- Netlify Forms on contact section (data-netlify="true")
- JSON-LD LocalBusiness schema in head
- Loading screen that fades out
- Mobile-first responsive

SECTIONS (wrap each with section markers):
${sections.join(', ')}

SECTION MARKERS — use exactly:
<!-- SECTION:name START -->
<section id="name">...</section>
<!-- SECTION:name END -->

OUTPUT: Return ONLY the complete HTML from <!DOCTYPE html> to </html>. No markdown, no explanation.`;
}

// ─── AI call (OpenAI / Claude / Gemini) ──────────────────────────────────────
async function callAI(model, prompt, maxTokens) {
  const modelMax = MODEL_MAX[model] || 8192;
  const tokens = Math.min(maxTokens, modelMax);

  if (model.startsWith('gpt')) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not configured (OPENAI_API_KEY missing)');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: tokens })
    });
    const d = await r.json();
    if (d.error) {
      if (d.error.code === 'insufficient_quota') throw new Error('OpenAI quota exceeded — check your billing at platform.openai.com');
      if (d.error.code === 'invalid_api_key') throw new Error('Invalid OpenAI API key — check your OPENAI_API_KEY env var');
      throw new Error(`OpenAI error: ${d.error.message}`);
    }
    return d.choices?.[0]?.message?.content || '';
  }

  if (model.startsWith('claude')) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured (ANTHROPIC_API_KEY missing)');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: tokens, messages: [{ role: 'user', content: prompt }] })
    });
    const d = await r.json();
    if (d.error) {
      if (d.error.type === 'authentication_error') throw new Error('Invalid Anthropic API key — check your ANTHROPIC_API_KEY env var');
      if (d.error.type === 'rate_limit_error') throw new Error('Claude rate limit hit — wait a moment and try again (or use a different model)');
      if (d.error.type === 'overloaded_error') throw new Error('Claude is overloaded — try GPT-4o-mini or Gemini Flash instead');
      throw new Error(`Claude error: ${d.error.message || JSON.stringify(d.error)}`);
    }
    return d.content?.[0]?.text || '';
  }

  if (model.startsWith('gemini')) {
    if (!process.env.GOOGLE_AI_API_KEY) throw new Error('Google AI API key not configured (GOOGLE_AI_API_KEY missing)');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: tokens, temperature: 0.8 }
      })
    });
    const d = await r.json();
    if (d.error) {
      if (d.error.code === 400) throw new Error('Invalid Gemini API key — check your GOOGLE_AI_API_KEY env var');
      if (d.error.code === 429) throw new Error('Gemini rate limit hit — wait a moment and try again');
      throw new Error(`Gemini error: ${d.error.message}`);
    }
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Unknown model: ${model}. Supported: gpt-4o-mini, gpt-4o, claude-sonnet-4-6, claude-haiku-4-5-20251001, gemini-2.0-flash, gemini-2.5-pro`);
}

// ─── Extract CSS variables from generated skeleton HTML ───────────────────────
function extractCSSVars(html) {
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/s);
  if (!rootMatch) return '';
  return `:root { ${rootMatch[1].trim()} }`;
}

// ─── Clean AI response ───────────────────────────────────────────────────────
function cleanHtml(text) {
  return text
    .replace(/^```html\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  const body = await req.json();
  const {
    jobId, mode, section, css_vars,
    business, scraped,
    manual_instructions, manual_prompt, patch_instruction, existing_html,
    page_type, quality, section_to_patch, style_refs,
    model, authToken
  } = body;

  const store = getStore({ name: 'gen-jobs', consistency: 'strong' });

  // Auth check
  const correct = process.env.CRM_PASSWORD || 'Gowithskillcalltracker2026';
  if (authToken !== Buffer.from(correct).toString('base64')) {
    await store.setJSON(jobId, { status: 'error', error: 'Unauthorized' });
    return;
  }

  await store.setJSON(jobId, { status: 'running', mode: mode || 'full', started: Date.now() });

  const useModel = model || process.env.AI_MODEL || 'gpt-4o-mini';
  const useQuality = quality || 'standard';

  try {
    // Stop flag check
    try { const stop = await store.get(`stop_${jobId}`); if (stop) { await store.setJSON(jobId, { status: 'stopped' }); return; } } catch {}

    // ── Mode: skeleton ────────────────────────────────────────────────────────
    if (mode === 'skeleton') {
      const prompt = buildSkeletonPrompt(business, scraped || {});
      let html = await callAI(useModel, prompt, 4096);
      html = cleanHtml(html);

      if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
        throw new Error('Skeleton generation failed — AI returned incomplete HTML. Try a different model.');
      }

      const cssVarsExtracted = extractCSSVars(html);
      await store.setJSON(jobId, { status: 'done', html, css_vars: cssVarsExtracted, completed: Date.now() });
      return;
    }

    // ── Mode: section ─────────────────────────────────────────────────────────
    if (mode === 'section') {
      if (!section) throw new Error('Section name required for section mode');
      const prompt = buildSectionPrompt(section, business, scraped || {}, css_vars || '', useQuality);
      let html = await callAI(useModel, prompt, 2500);
      html = cleanHtml(html);

      // Validate section markers present
      if (!html.includes(`<!-- SECTION:${section}`)) {
        // Try to wrap it if AI forgot the markers
        html = `<!-- SECTION:${section} START -->\n<section id="${section}" class="section">\n${html}\n</section>\n<!-- SECTION:${section} END -->`;
      }

      await store.setJSON(jobId, { status: 'done', html, section, completed: Date.now() });
      return;
    }

    // ── Mode: full (default) ──────────────────────────────────────────────────
    const maxTokens = QUALITY[useQuality]?.max_tokens || 8192;

    // Check for custom prompt in Blobs (set via admin panel)
    let customPrompt = null;
    try {
      const settingsStore = getStore({ name: 'settings', consistency: 'strong' });
      customPrompt = await settingsStore.get('custom_prompt', { type: 'text' });
    } catch {}

    const prompt = buildFullPrompt(business, scraped || {}, {
      manual_instructions, manual_prompt, patch_instruction, existing_html,
      page_type, quality: useQuality, section_to_patch, style_refs,
      custom_prompt: customPrompt
    });

    let html = await callAI(useModel, prompt, maxTokens);
    html = cleanHtml(html);

    // Section patch mode
    if (patch_instruction && section_to_patch) {
      await store.setJSON(jobId, { status: 'done', html, is_patch: true, section: section_to_patch, completed: Date.now() });
      return;
    }

    if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
      throw new Error('AI returned incomplete HTML. Try a lower quality setting or different model.');
    }

    if (html.length < 3000) {
      throw new Error(`Generated site is too short (${html.length} chars). Try Standard quality or GPT-4o-mini.`);
    }

    // Extract sections
    const sections = {};
    const sectionRx = /<!-- SECTION:(\w+) START -->([\s\S]*?)<!-- SECTION:\1 END -->/g;
    let m;
    while ((m = sectionRx.exec(html)) !== null) sections[m[1]] = m[2].trim();

    await store.setJSON(jobId, { status: 'done', html, sections, model: useModel, quality: useQuality, completed: Date.now() });

  } catch (e) {
    await store.setJSON(jobId, { status: 'error', error: e.message, completed: Date.now() });
  }
};

export const config = { path: '/api/generate-bg' };
