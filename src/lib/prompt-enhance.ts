// Deterministic, token-free suggestion engine. Given the current prompt draft
// and (optionally) the current build HTML, propose short addon phrases the
// user can click to append before sending. Also returns "starter" ideas when
// the draft is empty. No network, no AI — instant + free.

export type Addon = {
  id: string;
  label: string;      // shown on the chip
  snippet: string;    // appended to the prompt
  reason?: string;    // hover title
};

const KEYWORD_ADDONS: Array<{ match: RegExp; addons: Addon[] }> = [
  {
    match: /\b(hero|landing|home\s*page)\b/i,
    addons: [
      { id: "hero-cta", label: "+ Primary CTA button", snippet: "Include a bold primary call-to-action button." },
      { id: "hero-sub", label: "+ Subheading", snippet: "Add a concise subheading under the headline." },
      { id: "hero-img", label: "+ Hero image", snippet: "Include a striking hero image on the right." },
    ],
  },
  {
    match: /\b(pricing|plans?|tier)\b/i,
    addons: [
      { id: "pricing-3", label: "+ 3 tiers", snippet: "Use three tiers: Starter, Pro (highlighted), Enterprise." },
      { id: "pricing-toggle", label: "+ Monthly/Yearly toggle", snippet: "Add a monthly/yearly billing toggle." },
      { id: "pricing-features", label: "+ Feature checkmarks", snippet: "List features with check icons per tier." },
    ],
  },
  {
    match: /\b(form|contact|signup|sign\s*up|login|register)\b/i,
    addons: [
      { id: "form-validate", label: "+ Client validation", snippet: "Add inline validation and helpful error messages." },
      { id: "form-a11y", label: "+ Labels & aria", snippet: "Use proper labels, aria-* attributes and visible focus." },
      { id: "form-success", label: "+ Success state", snippet: "Show a success confirmation after submit." },
    ],
  },
  {
    match: /\b(dashboard|admin|analytics|stats?)\b/i,
    addons: [
      { id: "dash-cards", label: "+ KPI cards", snippet: "Include a row of KPI summary cards at the top." },
      { id: "dash-chart", label: "+ Chart", snippet: "Include an SVG line or bar chart with sample data." },
      { id: "dash-table", label: "+ Data table", snippet: "Include a sortable data table below the metrics." },
    ],
  },
  {
    match: /\b(gallery|portfolio|images?|photos?)\b/i,
    addons: [
      { id: "gal-grid", label: "+ Responsive grid", snippet: "Use a responsive masonry-style grid." },
      { id: "gal-lightbox", label: "+ Lightbox on click", snippet: "Open images in a lightbox modal on click." },
    ],
  },
  {
    match: /\b(nav|navbar|menu|header)\b/i,
    addons: [
      { id: "nav-mobile", label: "+ Mobile menu", snippet: "Include a mobile hamburger menu with drawer." },
      { id: "nav-sticky", label: "+ Sticky on scroll", snippet: "Make the header sticky with a subtle blur on scroll." },
    ],
  },
  {
    match: /\b(blog|article|post)\b/i,
    addons: [
      { id: "blog-toc", label: "+ Table of contents", snippet: "Add a sticky table of contents on the side." },
      { id: "blog-meta", label: "+ Author & date", snippet: "Show author avatar, name and publish date." },
    ],
  },
];

const UNIVERSAL_QUALITY: Addon[] = [
  { id: "u-mobile", label: "+ Mobile responsive", snippet: "Ensure mobile-first responsive layout down to 320px." },
  { id: "u-a11y", label: "+ WCAG AA contrast", snippet: "Use WCAG AA contrast and visible keyboard focus." },
  { id: "u-motion", label: "+ Subtle animation", snippet: "Add tasteful entrance animations and hover states." },
  { id: "u-dark", label: "+ Dark theme polish", snippet: "Refine the dark theme with amber/gold accents and glass surfaces." },
];

const STARTER_IDEAS: Addon[] = [
  { id: "s-landing", label: "SaaS landing page", snippet: "Build a modern SaaS landing page with hero, features, pricing, testimonials and footer." },
  { id: "s-portfolio", label: "Personal portfolio", snippet: "Build a personal portfolio site with hero, projects grid, about and contact." },
  { id: "s-dashboard", label: "Analytics dashboard", snippet: "Build an analytics dashboard with KPI cards, a chart and a recent activity table." },
  { id: "s-pricing", label: "Pricing page", snippet: "Build a pricing page with three tiers and a monthly/yearly toggle." },
  { id: "s-restaurant", label: "Restaurant site", snippet: "Build a restaurant site with hero, menu categories, reservation form and location map." },
  { id: "s-agency", label: "Creative agency", snippet: "Build a bold creative-agency site with case studies grid, services and a contact CTA." },
  { id: "s-ecom", label: "Product page", snippet: "Build an e-commerce product page with gallery, variants, reviews and buy button." },
  { id: "s-blog", label: "Editorial blog", snippet: "Build an editorial blog homepage with featured article, category grid and newsletter signup." },
  { id: "s-event", label: "Event landing", snippet: "Build an event landing page with countdown, speakers, schedule and ticket tiers." },
  { id: "s-podcast", label: "Podcast homepage", snippet: "Build a podcast homepage with episode list, embedded player and subscribe links." },
  { id: "s-app", label: "Mobile app promo", snippet: "Build a mobile app promo site with device mockups, feature list and app store buttons." },
  { id: "s-doc", label: "Docs starter", snippet: "Build a documentation starter with sidebar nav, search bar and a markdown-styled content area." },
  { id: "s-course", label: "Online course", snippet: "Build an online-course landing page with syllabus, instructor bio and enrollment CTA." },
  { id: "s-crm", label: "CRM dashboard", snippet: "Build a CRM dashboard with contacts table, pipeline kanban and activity feed." },
  { id: "s-invoice", label: "Invoice generator", snippet: "Build an invoice generator with editable line items, totals and a PDF-style preview." },
  { id: "s-todo", label: "Focus to-do app", snippet: "Build a focus to-do app with quick add, keyboard shortcuts and a Pomodoro timer." },
  { id: "s-kanban", label: "Kanban board", snippet: "Build a kanban board with draggable cards across three columns and a quick-add input." },
  { id: "s-habit", label: "Habit tracker", snippet: "Build a habit tracker with weekly grid, streak counters and a gentle celebratory animation." },
  { id: "s-recipe", label: "Recipe card", snippet: "Build a recipe card page with hero photo, ingredient list, step timeline and print button." },
  { id: "s-wedding", label: "Wedding invite", snippet: "Build an elegant wedding invitation page with RSVP form, schedule and travel info." },
  { id: "s-real", label: "Real estate listing", snippet: "Build a real estate listing with photo gallery, floor plan, features grid and agent card." },
  { id: "s-travel", label: "Travel itinerary", snippet: "Build a travel itinerary page with day-by-day timeline, map thumbnails and packing list." },
  { id: "s-fitness", label: "Fitness program", snippet: "Build a fitness program page with weekly workouts, exercise cards and a progress ring." },
  { id: "s-resume", label: "Resume site", snippet: "Build a one-page resume site with hero, experience timeline, skills grid and download button." },
  { id: "s-linktree", label: "Link-in-bio", snippet: "Build a link-in-bio page with avatar, bio, stacked action buttons and social icons." },
  { id: "s-quiz", label: "Interactive quiz", snippet: "Build an interactive quiz with 5 questions, progress bar and a personalised result screen." },
  { id: "s-poll", label: "Live poll", snippet: "Build a live poll page with question, option buttons and animated result bars." },
  { id: "s-chatui", label: "AI chat UI", snippet: "Build a polished AI chat UI with message bubbles, typing indicator and suggestion chips." },
  { id: "s-changelog", label: "Product changelog", snippet: "Build a product changelog page with version headings, tag chips and grouped entries." },
  { id: "s-status", label: "Status page", snippet: "Build a status page with service list, uptime bars and an incident history feed." },
  { id: "s-comingsoon", label: "Coming soon", snippet: "Build a coming-soon page with countdown, email waitlist form and animated background." },
  { id: "s-404", label: "Playful 404", snippet: "Build a playful 404 page with an illustration, witty copy and a back-home button." },
  { id: "s-testimonials", label: "Testimonial wall", snippet: "Build a testimonial wall with masonry cards, avatars, quotes and source logos." },
  { id: "s-faq", label: "FAQ page", snippet: "Build a searchable FAQ page with category filters and accordion answers." },
  { id: "s-nonprofit", label: "Nonprofit donate", snippet: "Build a nonprofit donation page with mission story, impact stats and preset donation amounts." },
  { id: "s-menu", label: "Digital menu", snippet: "Build a digital menu with categories, dish cards, prices and dietary icons." },
  { id: "s-book", label: "Book landing", snippet: "Build a book landing page with cover mockup, author bio, chapter preview and buy links." },
  { id: "s-music", label: "Album page", snippet: "Build a music album page with cover art, track list, embedded player and tour dates." },
  { id: "s-weather", label: "Weather dashboard", snippet: "Build a weather dashboard with current conditions card, hourly strip and 7-day forecast." },
  { id: "s-crypto", label: "Crypto tracker", snippet: "Build a crypto tracker with price cards, sparklines and a portfolio total." },
  { id: "s-timer", label: "Meeting timer", snippet: "Build a meeting timer with big countdown, cost-per-minute readout and start/pause controls." },
];

// A stable-per-session shuffle so the cycle order feels fresh but is deterministic.
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getStarterIdeas(offset: number, count = 4, seed = 1): Addon[] {
  const pool = shuffled(STARTER_IDEAS, seed);
  const out: Addon[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(offset + i) % pool.length]);
  }
  return out;
}

export const STARTER_IDEA_COUNT = STARTER_IDEAS.length;

export function suggestAddons(draft: string, hasHtml: boolean, offset = 0, seed = 1): Addon[] {
  const text = draft.trim();
  if (!text) return getStarterIdeas(offset, 4, seed);

  const out: Addon[] = [];
  const seen = new Set<string>();
  const push = (a: Addon) => {
    if (seen.has(a.id)) return;
    // don't suggest things already present in the draft
    const key = a.snippet.slice(0, 24).toLowerCase();
    if (text.toLowerCase().includes(key)) return;
    seen.add(a.id);
    out.push(a);
  };

  for (const group of KEYWORD_ADDONS) {
    if (group.match.test(text)) group.addons.forEach(push);
  }
  // Fill with universal quality addons
  for (const a of UNIVERSAL_QUALITY) push(a);
  // If iterating on an existing build, bias toward incremental refinements
  if (hasHtml) {
    push({ id: "keep", label: "+ Preserve existing", snippet: "Preserve every currently-working feature." });
  }
  return out.slice(0, 6);
}
