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
];

export function suggestAddons(draft: string, hasHtml: boolean): Addon[] {
  const text = draft.trim();
  if (!text) return STARTER_IDEAS.slice(0, 4);

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
