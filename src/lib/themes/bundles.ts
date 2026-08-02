/**
 * themes: six bundles that move on all nine axes, not just color.
 * The generator receives concrete hex values and pixel numbers via
 * themePromptFragment(), never adjectives. Adjectives are why themes
 * collapse into each other.
 */

export interface ThemeBundle {
  name: string;
  /** Axis 1: color palette. */
  palette: { bg: string; surface: string; text: string; accent: string };
  /** Axis 2: heading typeface. */
  headingFont: string;
  /** Axis 3: body typeface. */
  bodyFont: string;
  /** Axis 4: corner radius in px. */
  cornerRadiusPx: number;
  /** Axis 5: base spacing unit in px. */
  spacingUnitPx: number;
  /** Axis 6: elevation / shadow recipe. */
  shadow: string;
  /** Axis 7: motion budget. */
  motion: { durationMs: number; easing: string };
  /** Axis 8: border treatment. */
  borderStyle: string;
  /** Axis 9: surface texture / imagery direction. */
  surfaceTreatment: string;
}

export const THEMES: ThemeBundle[] = [
  {
    name: 'Dark Tech',
    palette: { bg: '#0A0E14', surface: '#131A24', text: '#E6EDF3', accent: '#00D4FF' },
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
    cornerRadiusPx: 6,
    spacingUnitPx: 8,
    shadow: '0 0 24px rgba(0,212,255,.15)',
    motion: { durationMs: 200, easing: 'cubic-bezier(0.2,0,0,1)' },
    borderStyle: '1px solid rgba(255,255,255,.08)',
    surfaceTreatment: 'subtle grid lines and soft accent glow gradients on dark panels',
  },
  {
    name: 'Web3 Neon',
    palette: { bg: '#14001F', surface: '#23063A', text: '#F2E9FF', accent: '#B24BF3' },
    headingFont: 'Clash Display',
    bodyFont: 'Satoshi',
    cornerRadiusPx: 16,
    spacingUnitPx: 10,
    shadow: '0 8px 40px rgba(178,75,243,.35)',
    motion: { durationMs: 350, easing: 'ease-out' },
    borderStyle: '1px solid rgba(178,75,243,.4)',
    surfaceTreatment: 'fine noise texture over deep purple radial gradients',
  },
  {
    name: 'Clean SaaS',
    palette: { bg: '#FFFFFF', surface: '#F6F8FA', text: '#1F2328', accent: '#2563EB' },
    headingFont: 'Inter',
    bodyFont: 'Inter',
    cornerRadiusPx: 8,
    spacingUnitPx: 8,
    shadow: '0 1px 3px rgba(16,24,40,.1)',
    motion: { durationMs: 150, easing: 'ease-in-out' },
    borderStyle: '1px solid #E5E7EB',
    surfaceTreatment: 'flat white surfaces, no texture, generous card gaps',
  },
  {
    name: 'Editorial Serif',
    palette: { bg: '#FAF7F2', surface: '#FFFFFF', text: '#1A1712', accent: '#8C2F1B' },
    headingFont: 'Playfair Display',
    bodyFont: 'Source Serif 4',
    cornerRadiusPx: 0,
    spacingUnitPx: 12,
    shadow: 'none',
    motion: { durationMs: 400, easing: 'ease' },
    borderStyle: '1px solid #1A1712',
    surfaceTreatment: 'generous whitespace with full-bleed photography and thin rules',
  },
  {
    name: 'Playful Bold',
    palette: { bg: '#FFF8E7', surface: '#FFFFFF', text: '#221B4E', accent: '#FF5D73' },
    headingFont: 'Fredoka',
    bodyFont: 'Nunito',
    cornerRadiusPx: 24,
    spacingUnitPx: 12,
    shadow: '0 6px 0 #221B4E',
    motion: { durationMs: 250, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    borderStyle: '3px solid #221B4E',
    surfaceTreatment: 'chunky rounded shapes with sticker-style flat illustrations',
  },
  {
    name: 'Brutalist',
    palette: { bg: '#EDEDED', surface: '#FFFFFF', text: '#000000', accent: '#FF2B06' },
    headingFont: 'Archivo Black',
    bodyFont: 'IBM Plex Mono',
    cornerRadiusPx: 0,
    spacingUnitPx: 16,
    shadow: '8px 8px 0 #000000',
    motion: { durationMs: 0, easing: 'linear' },
    borderStyle: '2px solid #000000',
    surfaceTreatment: 'raw monochrome blocks, oversized type, visible structure',
  },
];

/** The nine axes as comparable fingerprints. */
const AXES: ((t: ThemeBundle) => string)[] = [
  (t) => JSON.stringify(t.palette),
  (t) => t.headingFont,
  (t) => t.bodyFont,
  (t) => String(t.cornerRadiusPx),
  (t) => String(t.spacingUnitPx),
  (t) => t.shadow,
  (t) => JSON.stringify(t.motion),
  (t) => t.borderStyle,
  (t) => t.surfaceTreatment,
];

/** Number of the nine axes on which two bundles differ. */
export function axisDiff(a: ThemeBundle, b: ThemeBundle): number {
  return AXES.filter((f) => f(a) !== f(b)).length;
}

export function getTheme(name: string): ThemeBundle | undefined {
  return THEMES.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

/**
 * Concrete-value prompt fragment for the generator: exact hexes, exact
 * pixel numbers, exact durations. No adjectives.
 */
export function themePromptFragment(t: ThemeBundle): string {
  return [
    `THEME: ${t.name}. Use these exact values, no substitutes.`,
    `Colors: background ${t.palette.bg}, surface ${t.palette.surface}, text ${t.palette.text}, accent ${t.palette.accent}.`,
    `Type: headings in "${t.headingFont}", body in "${t.bodyFont}".`,
    `Shape: corner radius ${t.cornerRadiusPx}px, base spacing unit ${t.spacingUnitPx}px, borders ${t.borderStyle}.`,
    `Depth: box-shadow ${t.shadow}.`,
    `Motion: transitions ${t.motion.durationMs}ms ${t.motion.easing}.`,
    `Surface: ${t.surfaceTreatment}.`,
  ].join(' ');
}
