// Design Library — data model, curated catalog, DesignContract helpers,
// per-session storage, and Obsidian Approved local collection.
//
// This module is browser-safe. Server-only work (21st.dev fetches) lives in
// design-library.functions.ts. All strings/urls that could originate from
// remote sources must be run through the sanitize helpers here before render.

import { safeGet, safeSet } from "./safe-storage";

// ---------- Types ----------------------------------------------------------

export type MoodTag =
  | "minimal" | "editorial" | "cinematic" | "futuristic" | "playful"
  | "luxury" | "brutalist" | "corporate" | "dense" | "vibrant" | "experimental";

export type IndustryTag =
  | "saas" | "ai" | "dashboard" | "portfolio" | "agency" | "ecommerce"
  | "docs" | "auth" | "directory" | "event" | "landing" | "product";

export interface Palette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
  ring: string;
  border?: string;
}

export interface FontPairing {
  id: string;
  name: string;
  display: string;         // CSS font-family stack
  body: string;
  mono?: string;
  note?: string;
}

export interface MotionPreset {
  id: "none" | "subtle" | "smooth" | "expressive";
  name: string;
  durationMs: number;
  easing: string;
}

export type DensityPreset = "compact" | "balanced" | "airy";
export type RadiusPreset = "sharp" | "subtle" | "rounded" | "pill";
export type ShadowPreset = "none" | "subtle" | "elevated" | "dramatic";
export type LayoutPreset = "centered" | "split" | "asymmetric" | "editorial" | "dashboard";
export type ImageryPreset = "none" | "photo" | "illustration" | "3d" | "abstract" | "product-ui";
export type Appearance = "auto" | "light" | "dark";

export interface DesignStylePreset {
  id: string;
  name: string;
  mood: MoodTag[];
  audience: IndustryTag[];
  palette: Palette;
  fontPairingId: string;
  layout: LayoutPreset;
  density: DensityPreset;
  radius: RadiusPreset;
  shadow: ShadowPreset;
  motionId: MotionPreset["id"];
  imagery: ImageryPreset;
  description: string;
  tags: string[];
  source: "obsidian";
}

export interface TemplatePreset {
  id: string;
  name: string;
  category: IndustryTag;
  layout: LayoutPreset;
  description: string;
  sections: string[];       // narrative outline
  suggestedStyleIds: string[];
  tags: string[];
  source: "obsidian";
}

export interface ComponentReference {
  id: string;
  name: string;
  kind: "hero" | "pricing" | "features" | "testimonials" | "faq" | "cta"
      | "footer" | "nav" | "auth" | "onboarding" | "dashboard" | "table"
      | "chat" | "upload" | "gallery" | "sidebar" | "logo-cloud" | "stats";
  description: string;
  requirements: string[];   // concise contract, injected into prompt
  tags: string[];
  source: "obsidian" | "21st.dev";
  identifier?: string;      // remote id (for 21st.dev)
  attribution?: { name?: string; url?: string };
}

export interface DesignContract {
  templateId?: string;
  styleId?: string;
  appearance: Appearance;
  palette: Palette;
  fontPairingId: string;
  density: DensityPreset;
  radius: RadiusPreset;
  shadow: ShadowPreset;
  layout: LayoutPreset;
  motionId: MotionPreset["id"];
  imagery: ImageryPreset;
  componentIds: string[];   // references to CATALOG.components + approved
  designNote?: string;
  updatedAt: number;
}

// ---------- Seed catalog ----------------------------------------------------

export const FONT_PAIRINGS: FontPairing[] = [
  { id: "fp-inter-fraunces", name: "Fraunces / Inter", display: `"Fraunces", ui-serif, Georgia, serif`, body: `"Inter", ui-sans-serif, system-ui, sans-serif`, mono: `ui-monospace, SFMono-Regular, Menlo, monospace` },
  { id: "fp-space-grotesk", name: "Space Grotesk", display: `"Space Grotesk", ui-sans-serif, system-ui`, body: `"Space Grotesk", ui-sans-serif, system-ui` },
  { id: "fp-editorial", name: "Playfair / Inter", display: `"Playfair Display", ui-serif, Georgia, serif`, body: `"Inter", ui-sans-serif, system-ui, sans-serif` },
  { id: "fp-mono-brand", name: "JetBrains Mono / Inter", display: `"JetBrains Mono", ui-monospace, monospace`, body: `"Inter", ui-sans-serif, system-ui, sans-serif`, mono: `"JetBrains Mono", ui-monospace, monospace` },
  { id: "fp-clean-sans", name: "Neue Haas / System", display: `"Neue Haas Grotesk", "Helvetica Neue", ui-sans-serif`, body: `ui-sans-serif, system-ui, sans-serif` },
  { id: "fp-luxury", name: "Cormorant / Inter", display: `"Cormorant Garamond", ui-serif, Georgia, serif`, body: `"Inter", ui-sans-serif, system-ui, sans-serif` },
];

export const MOTION_PRESETS: MotionPreset[] = [
  { id: "none", name: "None", durationMs: 0, easing: "linear" },
  { id: "subtle", name: "Subtle", durationMs: 180, easing: "cubic-bezier(0.4,0,0.2,1)" },
  { id: "smooth", name: "Smooth", durationMs: 280, easing: "cubic-bezier(0.16,1,0.3,1)" },
  { id: "expressive", name: "Expressive", durationMs: 420, easing: "cubic-bezier(0.22,1.2,0.36,1)" },
];

const P = {
  cinematic: { bg: "#050608", surface: "#0d1015", text: "#f2eee7", muted: "#8b8f99", primary: "#F4A125", accent: "#DD9324", ring: "#F4A125", border: "rgba(244,161,37,0.22)" },
  editorial: { bg: "#faf7f2", surface: "#ffffff", text: "#111317", muted: "#5b6070", primary: "#111317", accent: "#7a4b2a", ring: "#111317", border: "rgba(17,19,23,0.12)" },
  gradientSaas: { bg: "#0b1020", surface: "#111938", text: "#eef1ff", muted: "#8a92b4", primary: "#7c5cff", accent: "#00c2ff", ring: "#7c5cff", border: "rgba(124,92,255,0.28)" },
  brutalist: { bg: "#fef9c3", surface: "#ffffff", text: "#000000", muted: "#333", primary: "#000000", accent: "#ff2e63", ring: "#000000", border: "#000" },
  softProduct: { bg: "#fbf9f6", surface: "#ffffff", text: "#2a2a2a", muted: "#7a7a7a", primary: "#2f6f4f", accent: "#f4a261", ring: "#2f6f4f", border: "rgba(0,0,0,0.08)" },
  swiss: { bg: "#ffffff", surface: "#f5f5f5", text: "#111", muted: "#666", primary: "#e30613", accent: "#111", ring: "#e30613", border: "#111" },
  futuristic3D: { bg: "#04030a", surface: "#0e0b1e", text: "#e6e6ff", muted: "#9a9ac0", primary: "#00ffd1", accent: "#ff00e5", ring: "#00ffd1", border: "rgba(0,255,209,0.28)" },
  playful: { bg: "#fff7e6", surface: "#ffffff", text: "#2b1d0e", muted: "#6b5a45", primary: "#ff6b6b", accent: "#ffd166", ring: "#ff6b6b", border: "rgba(0,0,0,0.08)" },
  luxuryMono: { bg: "#0a0a0a", surface: "#141414", text: "#eaeaea", muted: "#8a8a8a", primary: "#d4af37", accent: "#f5f5f5", ring: "#d4af37", border: "rgba(212,175,55,0.35)" },
  dashboardDense: { bg: "#0b0d12", surface: "#12151d", text: "#e6e9ef", muted: "#8a8f9e", primary: "#4f8cff", accent: "#22d3ee", ring: "#4f8cff", border: "rgba(255,255,255,0.08)" },
  experimentalType: { bg: "#ffffff", surface: "#f2f2ee", text: "#0a0a0a", muted: "#525252", primary: "#000000", accent: "#ff5a1f", ring: "#000000", border: "#0a0a0a" },
  conversion: { bg: "#f7fafc", surface: "#ffffff", text: "#0f172a", muted: "#64748b", primary: "#0ea5e9", accent: "#22c55e", ring: "#0ea5e9", border: "rgba(15,23,42,0.1)" },
} as const;

export const STYLES: DesignStylePreset[] = [
  { id: "editorial-minimal", name: "Editorial Minimal", mood: ["editorial", "minimal"], audience: ["portfolio", "docs", "agency"], palette: P.editorial, fontPairingId: "fp-editorial", layout: "editorial", density: "airy", radius: "subtle", shadow: "subtle", motionId: "subtle", imagery: "photo", description: "Print-magazine typography, generous whitespace, hairline dividers, occasional wide photography.", tags: ["magazine","serif","calm"], source: "obsidian" },
  { id: "dark-cinematic-tech", name: "Dark Cinematic Tech", mood: ["cinematic", "futuristic"], audience: ["ai","saas","product","landing"], palette: P.cinematic, fontPairingId: "fp-inter-fraunces", layout: "asymmetric", density: "balanced", radius: "rounded", shadow: "elevated", motionId: "smooth", imagery: "abstract", description: "Deep black canvas, amber accent glow, layered glass surfaces, tight display type.", tags: ["dark","glass","glow"], source: "obsidian" },
  { id: "vibrant-gradient-saas", name: "Vibrant Gradient SaaS", mood: ["vibrant"], audience: ["saas","ai","landing"], palette: P.gradientSaas, fontPairingId: "fp-space-grotesk", layout: "split", density: "balanced", radius: "rounded", shadow: "elevated", motionId: "smooth", imagery: "abstract", description: "Purple-cyan mesh gradients, bento grids, gradient text, modern SaaS feel.", tags: ["gradient","saas"], source: "obsidian" },
  { id: "neo-brutalist", name: "Neo-Brutalist", mood: ["brutalist","playful"], audience: ["agency","product","portfolio"], palette: P.brutalist, fontPairingId: "fp-mono-brand", layout: "asymmetric", density: "balanced", radius: "sharp", shadow: "dramatic", motionId: "expressive", imagery: "illustration", description: "Hard shadows, thick borders, high-contrast blocks, quirky typography.", tags: ["bold","offset-shadow"], source: "obsidian" },
  { id: "soft-product-minimal", name: "Soft Product Minimalism", mood: ["minimal","corporate"], audience: ["product","saas","ecommerce"], palette: P.softProduct, fontPairingId: "fp-clean-sans", layout: "centered", density: "airy", radius: "rounded", shadow: "subtle", motionId: "subtle", imagery: "product-ui", description: "Warm off-white, sage accent, honest UI screenshots, rounded corners.", tags: ["warm","gentle"], source: "obsidian" },
  { id: "swiss-grid", name: "Swiss Grid", mood: ["minimal","editorial","corporate"], audience: ["docs","agency","landing"], palette: P.swiss, fontPairingId: "fp-clean-sans", layout: "editorial", density: "compact", radius: "sharp", shadow: "none", motionId: "none", imagery: "none", description: "Strict grid, red accent, Helvetica-forward typography, information hierarchy first.", tags: ["grid","monochrome"], source: "obsidian" },
  { id: "futuristic-3d", name: "Futuristic 3D", mood: ["futuristic","experimental"], audience: ["ai","product","landing"], palette: P.futuristic3D, fontPairingId: "fp-space-grotesk", layout: "asymmetric", density: "balanced", radius: "rounded", shadow: "dramatic", motionId: "expressive", imagery: "3d", description: "Neon accents on inky background, 3D-object hero, animated particles.", tags: ["neon","3d"], source: "obsidian" },
  { id: "playful-illustration", name: "Playful Illustration", mood: ["playful"], audience: ["product","landing","directory"], palette: P.playful, fontPairingId: "fp-mono-brand", layout: "centered", density: "airy", radius: "rounded", shadow: "elevated", motionId: "expressive", imagery: "illustration", description: "Cheerful colors, hand-drawn SVGs, bouncy micro-interactions.", tags: ["fun","warm"], source: "obsidian" },
  { id: "luxury-monochrome", name: "Luxury Monochrome", mood: ["luxury","minimal","cinematic"], audience: ["ecommerce","portfolio","agency"], palette: P.luxuryMono, fontPairingId: "fp-luxury", layout: "centered", density: "airy", radius: "sharp", shadow: "subtle", motionId: "subtle", imagery: "photo", description: "Black canvas, gold hairlines, serif display, refined product photography.", tags: ["gold","black","serif"], source: "obsidian" },
  { id: "dashboard-dense", name: "Dashboard Dense", mood: ["dense","corporate"], audience: ["dashboard","saas","ai"], palette: P.dashboardDense, fontPairingId: "fp-clean-sans", layout: "dashboard", density: "compact", radius: "subtle", shadow: "subtle", motionId: "subtle", imagery: "product-ui", description: "Multi-column layout, tables, sparklines, dense information at a glance.", tags: ["admin","kpi"], source: "obsidian" },
  { id: "experimental-typography", name: "Experimental Typography", mood: ["experimental","editorial"], audience: ["portfolio","agency","landing"], palette: P.experimentalType, fontPairingId: "fp-editorial", layout: "editorial", density: "balanced", radius: "sharp", shadow: "none", motionId: "smooth", imagery: "abstract", description: "Oversized display type, mixed weights, marquee text, editorial rhythm.", tags: ["type","display"], source: "obsidian" },
  { id: "clean-conversion", name: "Clean Conversion Landing", mood: ["corporate","minimal"], audience: ["landing","saas","product"], palette: P.conversion, fontPairingId: "fp-clean-sans", layout: "centered", density: "balanced", radius: "rounded", shadow: "subtle", motionId: "subtle", imagery: "product-ui", description: "Hero + benefits + social proof + pricing + CTA. Optimized for conversion.", tags: ["landing","cta"], source: "obsidian" },
];

export const TEMPLATES: TemplatePreset[] = [
  { id: "tpl-saas-landing", name: "SaaS Landing", category: "saas", layout: "centered", description: "Hero, feature bento, social proof, pricing, FAQ, CTA, footer.", sections: ["nav","hero","logo-cloud","features-bento","testimonials","pricing","faq","cta","footer"], suggestedStyleIds: ["vibrant-gradient-saas","clean-conversion","dark-cinematic-tech"], tags: ["landing","saas"], source: "obsidian" },
  { id: "tpl-ai-product", name: "AI Product", category: "ai", layout: "asymmetric", description: "Interactive hero demo, model comparison, capabilities grid, pricing, docs link.", sections: ["nav","hero-interactive","capabilities","comparison","pricing","docs-cta","footer"], suggestedStyleIds: ["dark-cinematic-tech","futuristic-3d","vibrant-gradient-saas"], tags: ["ai","llm"], source: "obsidian" },
  { id: "tpl-dashboard", name: "Dashboard / Admin", category: "dashboard", layout: "dashboard", description: "Sidebar nav, top bar, KPI cards, chart, data table.", sections: ["sidebar","topbar","kpi-cards","chart","table","details-drawer"], suggestedStyleIds: ["dashboard-dense","dark-cinematic-tech"], tags: ["admin","internal"], source: "obsidian" },
  { id: "tpl-portfolio", name: "Portfolio", category: "portfolio", layout: "editorial", description: "Personal intro, selected work grid, case-study cards, contact.", sections: ["intro","selected-work","case-studies","about","contact"], suggestedStyleIds: ["editorial-minimal","luxury-monochrome","experimental-typography"], tags: ["personal","creative"], source: "obsidian" },
  { id: "tpl-agency", name: "Agency", category: "agency", layout: "split", description: "Bold statement, services, case studies, team, contact.", sections: ["hero-statement","services","case-studies","team","clients","contact"], suggestedStyleIds: ["swiss-grid","neo-brutalist","editorial-minimal"], tags: ["studio"], source: "obsidian" },
  { id: "tpl-ecommerce", name: "Ecommerce / Product", category: "ecommerce", layout: "split", description: "Product gallery, variants, price, reviews, related items, checkout CTA.", sections: ["nav","product-gallery","variants","price","reviews","related","footer"], suggestedStyleIds: ["luxury-monochrome","soft-product-minimal","clean-conversion"], tags: ["shop"], source: "obsidian" },
  { id: "tpl-docs", name: "Documentation", category: "docs", layout: "dashboard", description: "Left nav, article, right on-this-page, search.", sections: ["left-nav","article","toc","search"], suggestedStyleIds: ["swiss-grid","clean-conversion"], tags: ["docs"], source: "obsidian" },
  { id: "tpl-auth", name: "Authentication / Onboarding", category: "auth", layout: "split", description: "Split visual + form, providers, terms, welcome onboarding.", sections: ["split-visual","form","providers","onboarding-steps"], suggestedStyleIds: ["clean-conversion","dark-cinematic-tech","soft-product-minimal"], tags: ["signup","login"], source: "obsidian" },
  { id: "tpl-directory", name: "Directory / Marketplace", category: "directory", layout: "dashboard", description: "Filters sidebar, listing grid, detail preview, submit CTA.", sections: ["filters","listing-grid","detail-drawer","submit"], suggestedStyleIds: ["clean-conversion","dashboard-dense"], tags: ["marketplace"], source: "obsidian" },
  { id: "tpl-event", name: "Event / Waitlist", category: "event", layout: "centered", description: "Countdown, speakers/schedule OR waitlist form, sponsors, footer.", sections: ["hero-countdown","speakers-or-waitlist","schedule","sponsors","footer"], suggestedStyleIds: ["dark-cinematic-tech","luxury-monochrome","playful-illustration"], tags: ["event","waitlist"], source: "obsidian" },
];

export const COMPONENTS: ComponentReference[] = [
  { id: "cmp-hero-split", name: "Split Hero with CTA", kind: "hero", description: "Left copy + primary CTA + trust chips; right visual (image/product/animation).", requirements: ["h1 with tight tracking","primary+secondary CTA","3 trust chips","supporting visual"], tags: ["hero","split"], source: "obsidian" },
  { id: "cmp-hero-centered", name: "Centered Hero + Gradient", kind: "hero", description: "Centered eyebrow, huge headline with gradient text, subhead, primary CTA, marquee below.", requirements: ["eyebrow badge","gradient headline","primary CTA","logo marquee"], tags: ["hero","gradient"], source: "obsidian" },
  { id: "cmp-features-bento", name: "Features Bento Grid", kind: "features", description: "Asymmetric 4-6 card grid with icons, one-line titles, short body, hover lift.", requirements: ["3-6 tiles","asymmetric spans","hover elevation","semantic list"], tags: ["features","bento"], source: "obsidian" },
  { id: "cmp-pricing-3col", name: "Pricing — 3 Column", kind: "pricing", description: "Three plans, middle emphasized, checkmark features, monthly/annual toggle.", requirements: ["3 plans","monthly/annual toggle","emphasized middle plan","feature lists"], tags: ["pricing"], source: "obsidian" },
  { id: "cmp-testimonials", name: "Testimonials Marquee", kind: "testimonials", description: "Auto-scrolling quote cards with avatar, name, role, company.", requirements: ["6+ quotes","auto-scroll (pausable)","avatar+role","reduced-motion respected"], tags: ["testimonials"], source: "obsidian" },
  { id: "cmp-faq", name: "Accordion FAQ", kind: "faq", description: "Keyboard-accessible accordion; one open at a time; smooth open animation.", requirements: ["aria-expanded","keyboard support","one-open-at-a-time"], tags: ["faq"], source: "obsidian" },
  { id: "cmp-cta-band", name: "Full-width CTA Band", kind: "cta", description: "Bold gradient band with headline, subhead, primary CTA, and secondary link.", requirements: ["strong headline","gradient bg","primary CTA","secondary link"], tags: ["cta"], source: "obsidian" },
  { id: "cmp-nav-glass", name: "Sticky Glass Nav", kind: "nav", description: "Backdrop-blur nav with logo, links, and pill CTA. Compresses on scroll.", requirements: ["backdrop-blur","compress on scroll","mobile hamburger"], tags: ["nav"], source: "obsidian" },
  { id: "cmp-footer-mega", name: "Mega Footer", kind: "footer", description: "Multi-column links, newsletter, socials, legal row.", requirements: ["3-5 columns","newsletter input","social links","legal row"], tags: ["footer"], source: "obsidian" },
  { id: "cmp-auth-split", name: "Split Auth Card", kind: "auth", description: "Left brand visual, right form with OAuth providers, error states.", requirements: ["email+password","OAuth buttons","inline errors","forgot-password link"], tags: ["auth"], source: "obsidian" },
  { id: "cmp-onboarding-steps", name: "Onboarding Steps", kind: "onboarding", description: "Multi-step progress with per-step form and skip option.", requirements: ["3-4 steps","progress indicator","skip option","form validation"], tags: ["onboarding"], source: "obsidian" },
  { id: "cmp-dashboard-shell", name: "Dashboard Shell", kind: "dashboard", description: "Sidebar + topbar + main; supports collapsed sidebar.", requirements: ["collapsible sidebar","topbar with search","main content region"], tags: ["dashboard"], source: "obsidian" },
  { id: "cmp-data-table", name: "Data Table", kind: "table", description: "Sortable, filterable table with row selection and pagination.", requirements: ["sortable columns","filter input","row selection","pagination"], tags: ["table"], source: "obsidian" },
  { id: "cmp-chat", name: "Chat Panel", kind: "chat", description: "Message thread, composer with keyboard shortcut, streaming placeholder.", requirements: ["message thread","composer","enter-to-send","streaming state"], tags: ["chat"], source: "obsidian" },
  { id: "cmp-upload", name: "Upload Dropzone", kind: "upload", description: "Drag-and-drop with file previews, size/type validation.", requirements: ["drag-and-drop","file preview","size/type validation"], tags: ["upload"], source: "obsidian" },
  { id: "cmp-gallery", name: "Gallery Grid", kind: "gallery", description: "Responsive image grid with lightbox and keyboard nav.", requirements: ["responsive grid","lightbox","keyboard nav"], tags: ["gallery"], source: "obsidian" },
  { id: "cmp-stats", name: "Stats Row", kind: "stats", description: "3-4 headline stats with count-up animation.", requirements: ["3-4 stats","count-up on intersection","semantic dl/dt/dd"], tags: ["stats"], source: "obsidian" },
  { id: "cmp-logo-cloud", name: "Logo Cloud", kind: "logo-cloud", description: "6-10 grayscale logos in a responsive row.", requirements: ["6-10 SVG logos","grayscale","responsive wrap"], tags: ["logos"], source: "obsidian" },
];

export const CATALOG = { styles: STYLES, templates: TEMPLATES, components: COMPONENTS, fonts: FONT_PAIRINGS, motion: MOTION_PRESETS };

// ---------- Sanitization ----------------------------------------------------

const SAFE_URL = /^(https?:)?\/\//i;
export function safeUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  const s = String(u).trim();
  if (!s) return undefined;
  if (/^javascript:|^data:text\/html/i.test(s)) return undefined;
  if (!SAFE_URL.test(s) && !s.startsWith("/")) return undefined;
  return s.slice(0, 500);
}
export function safeText(s: unknown, max = 240): string {
  if (typeof s !== "string") return "";
  return s.replace(/[\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------- Contract helpers ------------------------------------------------

export function styleById(id?: string): DesignStylePreset | undefined {
  return id ? STYLES.find((s) => s.id === id) : undefined;
}
export function templateById(id?: string): TemplatePreset | undefined {
  return id ? TEMPLATES.find((t) => t.id === id) : undefined;
}
export function fontById(id?: string): FontPairing | undefined {
  return FONT_PAIRINGS.find((f) => f.id === id);
}

export function defaultContract(): DesignContract {
  const s = STYLES[1]; // dark cinematic tech — matches Obsidian brand
  return {
    styleId: s.id,
    appearance: "auto",
    palette: { ...s.palette },
    fontPairingId: s.fontPairingId,
    density: s.density,
    radius: s.radius,
    shadow: s.shadow,
    layout: s.layout,
    motionId: s.motionId,
    imagery: s.imagery,
    componentIds: [],
    updatedAt: Date.now(),
  };
}

export function applyStyleToContract(c: DesignContract, styleId: string): DesignContract {
  const s = styleById(styleId); if (!s) return c;
  return {
    ...c, styleId,
    palette: { ...s.palette },
    fontPairingId: s.fontPairingId,
    density: s.density, radius: s.radius, shadow: s.shadow,
    layout: s.layout, motionId: s.motionId, imagery: s.imagery,
    updatedAt: Date.now(),
  };
}

export function applyTemplateToContract(c: DesignContract, templateId: string): DesignContract {
  const t = templateById(templateId); if (!t) return c;
  const currentStyleOk = c.styleId && t.suggestedStyleIds.includes(c.styleId);
  const next = currentStyleOk ? c : applyStyleToContract(c, t.suggestedStyleIds[0]);
  return { ...next, templateId, layout: t.layout, updatedAt: Date.now() };
}

// ---------- Per-session persistence ----------------------------------------

const CONTRACT_PREFIX = "obs.designContract.v1.";
export function loadContract(sessionId: string): DesignContract | undefined {
  return safeGet<DesignContract>(CONTRACT_PREFIX + sessionId);
}
export function saveContract(sessionId: string, c: DesignContract): void {
  safeSet(CONTRACT_PREFIX + sessionId, c);
}
export function clearContract(sessionId: string): void {
  try { window.localStorage.removeItem(CONTRACT_PREFIX + sessionId); } catch { /* ignore */ }
}

// ---------- Obsidian Approved (owner-curated) ------------------------------

export interface ApprovedItem {
  id: string;
  kind: "style" | "template" | "component";
  label: string;
  source: "obsidian" | "21st.dev";
  identifier?: string;   // remote ref
  addedAt: number;
}
const APPROVED_KEY = "obs.designApproved.v1";
export function loadApproved(): ApprovedItem[] {
  const raw = safeGet<ApprovedItem[]>(APPROVED_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r.id === "string" && typeof r.kind === "string").slice(0, 200);
}
export function saveApproved(list: ApprovedItem[]): void {
  safeSet(APPROVED_KEY, list.slice(0, 200));
}
export function toggleApproved(item: ApprovedItem): ApprovedItem[] {
  const list = loadApproved();
  const exists = list.findIndex((x) => x.id === item.id && x.kind === item.kind);
  const next = exists >= 0 ? list.filter((_, i) => i !== exists) : [...list, item];
  saveApproved(next);
  return next;
}

// ---------- Prompt injection (used server-side too — no window access) -----

export function contractToSystemPrompt(c: DesignContract): string {
  const style = styleById(c.styleId);
  const template = templateById(c.templateId);
  const font = fontById(c.fontPairingId);
  const motion = MOTION_PRESETS.find((m) => m.id === c.motionId);
  const components = c.componentIds
    .map((id) => COMPONENTS.find((x) => x.id === id))
    .filter(Boolean) as ComponentReference[];
  const lines: string[] = [
    "DESIGN CONTRACT — this build MUST follow the chosen direction. Create an ORIGINAL design in this direction; do not clone any specific brand or site.",
  ];
  if (template) lines.push(`Template: ${template.name} — sections: ${template.sections.join(", ")}.`);
  if (style) lines.push(`Style: ${style.name} — ${style.description}`);
  lines.push(`Appearance: ${c.appearance}. Layout: ${c.layout}. Density: ${c.density}. Radius: ${c.radius}. Shadow: ${c.shadow}. Imagery: ${c.imagery}.`);
  lines.push(`Palette — bg ${c.palette.bg}, surface ${c.palette.surface}, text ${c.palette.text}, muted ${c.palette.muted}, primary ${c.palette.primary}, accent ${c.palette.accent}, ring ${c.palette.ring}. Preserve WCAG AA contrast.`);
  if (font) lines.push(`Typography — display: ${font.display}; body: ${font.body}${font.mono ? `; mono: ${font.mono}` : ""}.`);
  if (motion) lines.push(`Motion — ${motion.name} (${motion.durationMs}ms, ${motion.easing}). Respect prefers-reduced-motion.`);
  if (components.length) {
    lines.push("Required section contracts:");
    for (const cmp of components) {
      lines.push(`- ${cmp.name} (${cmp.kind}): ${cmp.requirements.join("; ")}.`);
    }
  }
  if (c.designNote) lines.push(`User note: ${safeText(c.designNote, 400)}`);
  lines.push("Rules: original design (not a clone), semantic HTML, keyboard-accessible interactive states, mobile-first responsive, realistic content, no placeholder/fake buttons, no external network calls beyond images.");
  return lines.join("\n");
}

// ---------- Inspire — 3 deterministic directions ---------------------------

export interface Direction {
  id: string;
  name: string;
  styleId: string;
  templateId?: string;
  palette: Palette;
  fontPairingId: string;
  layout: LayoutPreset;
  imagery: ImageryPreset;
  motionId: MotionPreset["id"];
  summary: string;
}

const KEYWORD_TO_TEMPLATE: Array<[RegExp, string]> = [
  [/\bdashboard|admin|analytics|kpi\b/i, "tpl-dashboard"],
  [/\bportfolio|personal site|about me\b/i, "tpl-portfolio"],
  [/\bagency|studio\b/i, "tpl-agency"],
  [/\bshop|store|ecommerce|product page\b/i, "tpl-ecommerce"],
  [/\bdocs|documentation|api reference\b/i, "tpl-docs"],
  [/\blogin|signup|sign up|onboarding|auth\b/i, "tpl-auth"],
  [/\bmarketplace|directory|listing\b/i, "tpl-directory"],
  [/\bevent|conference|waitlist|launch\b/i, "tpl-event"],
  [/\bai|llm|chatbot|assistant|copilot\b/i, "tpl-ai-product"],
];
export function guessTemplateId(prompt: string): string {
  for (const [re, id] of KEYWORD_TO_TEMPLATE) if (re.test(prompt)) return id;
  return "tpl-saas-landing";
}

const COMPONENT_KEYWORDS: Array<[RegExp, ComponentReference["kind"]]> = [
  [/\bhero\b/i, "hero"], [/\bpricing|plans?\b/i, "pricing"],
  [/\bfeatures?|bento\b/i, "features"], [/\btestimonial|reviews?\b/i, "testimonials"],
  [/\bfaq|questions?\b/i, "faq"], [/\bcta|call.to.action\b/i, "cta"],
  [/\bfooter\b/i, "footer"], [/\bnav(bar)?|menu\b/i, "nav"],
  [/\blogin|signup|auth\b/i, "auth"], [/\bonboard(ing)?\b/i, "onboarding"],
  [/\bdashboard\b/i, "dashboard"], [/\btable|grid of rows\b/i, "table"],
  [/\bchat|message\b/i, "chat"], [/\bupload|drop.?zone\b/i, "upload"],
  [/\bgallery|lightbox\b/i, "gallery"], [/\bsidebar\b/i, "sidebar"],
  [/\blogo cloud|trusted by\b/i, "logo-cloud"], [/\bstats|metrics|kpi\b/i, "stats"],
];
export function recommendComponentIds(prompt: string, limit = 6): string[] {
  const kinds = new Set<ComponentReference["kind"]>();
  for (const [re, kind] of COMPONENT_KEYWORDS) if (re.test(prompt)) kinds.add(kind);
  const picks = COMPONENTS.filter((c) => kinds.has(c.kind));
  const fallback = ["cmp-nav-glass","cmp-hero-centered","cmp-features-bento","cmp-testimonials","cmp-cta-band","cmp-footer-mega"]
    .map((id) => COMPONENTS.find((c) => c.id === id)!)
    .filter(Boolean);
  const out: string[] = [];
  for (const c of [...picks, ...fallback]) {
    if (!out.includes(c.id)) out.push(c.id);
    if (out.length >= limit) break;
  }
  return out;
}

export function inspireDirections(prompt: string): Direction[] {
  const tplId = guessTemplateId(prompt);
  const tpl = templateById(tplId)!;
  const pool = tpl.suggestedStyleIds.map(styleById).filter(Boolean) as DesignStylePreset[];
  // Ensure exactly 3 distinct directions by padding with other styles.
  const extras = STYLES.filter((s) => !pool.some((p) => p.id === s.id));
  const chosen = [...pool, ...extras].slice(0, 3);
  return chosen.map((s, i) => ({
    id: `dir-${s.id}-${i}`,
    name: `${s.name} · ${tpl.name}`,
    styleId: s.id,
    templateId: tpl.id,
    palette: s.palette,
    fontPairingId: s.fontPairingId,
    layout: s.layout,
    imagery: s.imagery,
    motionId: s.motionId,
    summary: s.description,
  }));
}
