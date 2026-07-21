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
  { id: "s-mood", label: "Mood journal", snippet: "Build a mood journal with daily emoji picker, note field and a soft weekly heatmap." },
  { id: "s-mindmap", label: "Mind map", snippet: "Build a mind-map canvas with draggable nodes, connecting curves and quick-add child nodes." },
  { id: "s-flashcards", label: "Flashcard study", snippet: "Build a flashcard study app with flip animation, deck selector and spaced-repetition indicators." },
  { id: "s-recipes", label: "Recipe finder", snippet: "Build a recipe finder with ingredient filters, dish cards and a saved-favorites shelf." },
  { id: "s-budget", label: "Budget tracker", snippet: "Build a monthly budget tracker with category rings, transaction list and a savings goal card." },
  { id: "s-workout", label: "Workout planner", snippet: "Build a workout planner with weekly split, exercise cards, set/rep inputs and a rest timer." },
  { id: "s-gratitude", label: "Gratitude wall", snippet: "Build a gratitude wall with sticky notes, gentle color palette and a shuffle button." },
  { id: "s-newsletter", label: "Newsletter landing", snippet: "Build a newsletter landing page with sample issue preview, testimonial row and email signup." },
  { id: "s-yearreview", label: "Year in review", snippet: "Build a personal year-in-review page with stat highlights, top moments and a shareable card." },
  { id: "s-cheatsheet", label: "Dev cheatsheet", snippet: "Build a developer cheatsheet page with searchable command list, categories and copy buttons." },
  { id: "s-color", label: "Color palette lab", snippet: "Build a color palette lab that generates palettes, shows contrast ratios and copy-to-clipboard chips." },
  { id: "s-type", label: "Typography tester", snippet: "Build a typography tester with font pairings, adjustable size/spacing and side-by-side previews." },
  { id: "s-svggen", label: "SVG pattern gen", snippet: "Build an SVG pattern generator with sliders for scale, rotation and color, plus copy SVG." },
  { id: "s-poem", label: "Poem of the day", snippet: "Build a poem-of-the-day page with elegant serif typography, quiet illustration and share button." },
  { id: "s-stargaze", label: "Stargazing guide", snippet: "Build a stargazing guide with tonight's visible constellations, moon phase and viewing tips." },
  { id: "s-plant", label: "Plant care", snippet: "Build a plant care dashboard with plant cards, watering schedule and next-care countdowns." },
  { id: "s-donation", label: "Donation thermometer", snippet: "Build a donation-drive page with animated goal thermometer, recent donors and preset amounts." },
  { id: "s-conference", label: "Conference site", snippet: "Build a conference site with speaker grid, multi-track schedule, venue map and ticket tiers." },
  { id: "s-hackathon", label: "Hackathon landing", snippet: "Build a hackathon landing with countdown, prize tiers, sponsor logos and application form." },
  { id: "s-charity", label: "Charity story", snippet: "Build a charity story page with emotional hero, impact numbers, program cards and donate CTA." },
  { id: "s-museum", label: "Museum exhibit", snippet: "Build a museum-exhibit page with parallax hero, artifact cards, timeline and visit info." },
  { id: "s-airline", label: "Flight status", snippet: "Build a flight-status page with big status banner, timeline of segments and gate/terminal info." },
  { id: "s-nutrition", label: "Nutrition tracker", snippet: "Build a nutrition tracker with meal log, macro ring, water tracker and daily summary card." },
  { id: "s-language", label: "Language lesson", snippet: "Build a language-lesson page with vocab cards, listen buttons, quick quiz and progress bar." },
  { id: "s-storyboard", label: "Storyboard grid", snippet: "Build a storyboard grid with numbered frames, caption fields, transition arrows and export button." },
  { id: "s-podcast-ep", label: "Podcast episode", snippet: "Build a single podcast episode page with big player, chapter list, show notes and guest card." },
  { id: "s-newsroom", label: "Newsroom hub", snippet: "Build a newsroom hub with lead story, category strip, press releases and media contact card." },
  { id: "s-comparison", label: "Product compare", snippet: "Build a product comparison page with three-column feature matrix, badges and pick-a-winner CTA." },
  { id: "s-carwash", label: "Local service", snippet: "Build a local car-wash site with hero, service tiers, gallery and a book-a-slot form." },
  { id: "s-fintech", label: "Fintech landing", snippet: "Build a fintech app landing with device mockup, security badges, live chart and waitlist form." },
  { id: "s-photo", label: "Photographer folio", snippet: "Build a photographer portfolio with full-bleed hero image, category filters and a services block." },
  { id: "s-yoga", label: "Yoga studio", snippet: "Build a yoga studio site with class schedule, teacher cards, pricing and a first-class CTA." },
  { id: "s-arcade", label: "Retro arcade", snippet: "Build a retro-arcade landing with pixel logo, game cards, high-scores and a play now button." },
  { id: "s-tarot", label: "Daily tarot", snippet: "Build a daily-tarot page with card of the day, upright/reversed meaning and a shuffle animation." },
  { id: "s-focus", label: "Focus timer", snippet: "Build a focus timer with breathing ring, session presets, ambient audio picker and daily total." },
  { id: "s-map", label: "Custom map", snippet: "Build a custom map page with plotted pins, category legend, popup cards and a distance readout." },
  { id: "s-scheduler", label: "Booking page", snippet: "Build a booking page with weekly availability grid, timezone note and confirmation modal." },
  { id: "s-inbox", label: "Inbox triage", snippet: "Build an email-inbox triage view with unread strip, keyboard shortcuts and swipe-style actions." },
  { id: "s-microsite", label: "Campaign microsite", snippet: "Build a bold campaign microsite with oversized headline, animated sections and a signup ribbon." },
  { id: "s-scavenger", label: "Scavenger hunt", snippet: "Build a scavenger-hunt page with numbered clues, checkoff boxes, hint reveals and a finish screen." },
  { id: "s-onboarding", label: "Onboarding tour", snippet: "Build a three-step onboarding flow with progress dots, illustration per step and skip option." },
  { id: "s-lookbook", label: "Fashion lookbook", snippet: "Build a fashion lookbook with editorial imagery, product tags on hover and a shop-the-look strip." },
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
